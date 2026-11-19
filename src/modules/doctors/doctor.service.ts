import { Types, trusted } from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/ApiError.js';
import { cache } from '../../lib/cache.js';
import { dayRangeToUtc } from '../../lib/dates.js';
import { buildMeta, toSort } from '../../lib/pagination.js';
import { searchFilter } from '../../utils/searchTokens.js';
import { CONDITIONS, Patient } from '../patients/patient.model.js';
import { Doctor } from './doctor.model.js';
import { toDoctorDTO } from './doctor.mapper.js';
import type { DoctorCreate, DoctorListQuery, DoctorUpdate } from './doctor.schemas.js';

type Filter = Record<string, unknown>;

/** Single place that turns the validated query into a Mongo filter (reused by find + count). */
function buildDoctorFilter(
  q: Pick<DoctorListQuery, 'q' | 'specialization' | 'hospital' | 'from' | 'to'>,
): Filter {
  const f: Filter = {};
  if (q.q) {
    const s = searchFilter(q.q);
    if (s) f.searchTokens = trusted(s);
  }
  // `trusted` marks server-built operators as safe under `sanitizeFilter`.
  if (q.specialization?.length) f.specialization = trusted({ $in: q.specialization });
  if (q.hospital?.length) f.hospital = trusted({ $in: q.hospital });
  if (q.from || q.to) f.createdAt = trusted(dayRangeToUtc(q.from, q.to, env.APP_TIMEZONE));
  return f;
}

const FACETS_KEY = 'doctors:facets';

export const doctorService = {
  buildDoctorFilter,

  async list(query: DoctorListQuery) {
    const { page, limit } = query;
    const filter = buildDoctorFilter(query);
    const skip = (page - 1) * limit;

    // Path B: sorting by patientCount needs the count for every matching doctor.
    if (query.sort === 'patientCount' || query.sort === '-patientCount') {
      const dir = query.sort.startsWith('-') ? -1 : 1;
      const [rows, total] = await Promise.all([
        Doctor.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: 'patients',
              localField: '_id',
              foreignField: 'doctor',
              as: 'p',
              pipeline: [{ $project: { _id: 1 } }],
            },
          },
          { $addFields: { patientCount: { $size: '$p' } } },
          { $project: { p: 0, searchTokens: 0 } },
          { $sort: { patientCount: dir, _id: dir } },
          { $skip: skip },
          { $limit: limit },
        ]),
        Doctor.countDocuments(filter),
      ]);
      return {
        data: rows.map((d) => toDoctorDTO(d, d.patientCount)),
        meta: buildMeta(page, limit, total),
      };
    }

    // Path A (common): indexed find + parallel count, then counts for this page only.
    const [docs, total] = await Promise.all([
      Doctor.find(filter).sort(toSort(query.sort)).skip(skip).limit(limit).lean(),
      Doctor.countDocuments(filter),
    ]);
    const counts = await Patient.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { doctor: { $in: docs.map((d) => d._id) } } },
      { $group: { _id: '$doctor', count: { $sum: 1 } } },
    ]);
    const byDoctor = new Map(counts.map((c) => [String(c._id), c.count]));
    return {
      data: docs.map((d) => toDoctorDTO(d, byDoctor.get(String(d._id)) ?? 0)),
      meta: buildMeta(page, limit, total),
    };
  },

  async getById(id: string) {
    const doctor = await Doctor.findById(id).lean();
    if (!doctor) throw ApiError.notFound('Doctor not found');
    const rows = await Patient.aggregate<{ _id: string; count: number }>([
      { $match: { doctor: doctor._id } },
      { $group: { _id: '$condition', count: { $sum: 1 } } },
    ]);
    const byCondition = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<string, number>;
    let totalPatients = 0;
    for (const r of rows) {
      byCondition[r._id] = r.count;
      totalPatients += r.count;
    }
    return { ...toDoctorDTO(doctor, totalPatients), stats: { totalPatients, byCondition } };
  },

  async create(body: DoctorCreate) {
    const doctor = await Doctor.create(body);
    cache.clear();
    return toDoctorDTO(doctor.toObject(), 0);
  },

  async update(id: string, body: DoctorUpdate) {
    const doctor = await Doctor.findById(id);
    if (!doctor) throw ApiError.notFound('Doctor not found');
    doctor.set(body); // validators + searchTokens hook run on save()
    await doctor.save();
    cache.clear();
    const patientCount = await Patient.countDocuments({ doctor: doctor._id });
    return toDoctorDTO(doctor.toObject(), patientCount);
  },

  async remove(id: string) {
    const doctor = await Doctor.exists({ _id: id });
    if (!doctor) throw ApiError.notFound('Doctor not found');
    const n = await Patient.countDocuments({ doctor: id });
    if (n > 0) {
      throw ApiError.conflict('DOCTOR_HAS_PATIENTS', `Doctor still has ${n} patients`, [
        { path: 'patients', message: String(n) },
      ]);
    }
    await Doctor.deleteOne({ _id: id });
    cache.clear();
  },

  async options(q: string | undefined, limit: number) {
    const filter: Filter = {};
    if (q) {
      const s = searchFilter(q);
      if (s) filter.searchTokens = trusted(s);
    }
    const docs = await Doctor.find(filter)
      .select('name specialization')
      .sort({ name: 1 })
      .limit(limit)
      .lean();
    return docs.map((d) => ({ id: String(d._id), name: d.name, specialization: d.specialization }));
  },

  async facets() {
    return cache.wrap(FACETS_KEY, 60_000, async () => {
      const [specializations, hospitals] = await Promise.all([
        Doctor.distinct('specialization'),
        Doctor.distinct('hospital'),
      ]);
      const sort = (a: string[]) => a.sort((x, y) => x.localeCompare(y));
      return { specializations: sort(specializations), hospitals: sort(hospitals) };
    });
  },

  async assertExists(id: string) {
    if (!(await Doctor.exists({ _id: id }))) throw ApiError.notFound('Doctor not found');
  },
};
