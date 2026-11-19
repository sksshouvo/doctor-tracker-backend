import { Types, trusted } from 'mongoose';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/ApiError.js';
import { cache } from '../../lib/cache.js';
import { dayRangeToUtc } from '../../lib/dates.js';
import { buildMeta, toSort } from '../../lib/pagination.js';
import { searchFilter } from '../../utils/searchTokens.js';
import { Doctor } from '../doctors/doctor.model.js';
import { Patient } from './patient.model.js';
import { toPatientDTO } from './patient.mapper.js';
import type { PatientCreate, PatientListQuery, PatientUpdate } from './patient.schemas.js';

type Filter = Record<string, unknown>;

function buildPatientFilter(q: Omit<PatientListQuery, 'page' | 'limit' | 'sort'>): Filter {
  const f: Filter = {};
  if (q.q) {
    const s = searchFilter(q.q);
    if (s) f.searchTokens = trusted(s);
  }
  if (q.condition?.length) f.condition = trusted({ $in: q.condition });
  if (q.doctorId) f.doctor = new Types.ObjectId(q.doctorId);
  if (q.gender) f.gender = q.gender;
  if (q.from || q.to) f[q.dateField] = trusted(dayRangeToUtc(q.from, q.to, env.APP_TIMEZONE));
  return f;
}

async function assertDoctorForBody(doctorId: string) {
  if (!(await Doctor.exists({ _id: doctorId }))) {
    throw ApiError.badRequest('Doctor does not exist', [
      { path: 'doctorId', message: 'Doctor does not exist' },
    ]);
  }
}

const populateDoctor = { path: 'doctor', select: 'name specialization' } as const;

export const patientService = {
  buildPatientFilter,

  async list(query: PatientListQuery) {
    const { page, limit } = query;
    const filter = buildPatientFilter(query);
    const [docs, total] = await Promise.all([
      Patient.find(filter)
        .sort(toSort(query.sort))
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(populateDoctor)
        .lean(),
      Patient.countDocuments(filter),
    ]);
    return { data: docs.map(toPatientDTO), meta: buildMeta(page, limit, total) };
  },

  async getById(id: string) {
    const p = await Patient.findById(id).populate(populateDoctor).lean();
    if (!p) throw ApiError.notFound('Patient not found');
    return toPatientDTO(p);
  },

  async create(body: PatientCreate) {
    const { doctorId, ...rest } = body;
    await assertDoctorForBody(doctorId);
    const created = await Patient.create({ ...rest, doctor: doctorId });
    cache.clear();
    return this.getById(String(created._id));
  },

  async createForDoctor(doctorId: string, body: Omit<PatientCreate, 'doctorId'>) {
    if (!(await Doctor.exists({ _id: doctorId }))) throw ApiError.notFound('Doctor not found');
    const created = await Patient.create({ ...body, doctor: doctorId });
    cache.clear();
    return this.getById(String(created._id));
  },

  async update(id: string, body: PatientUpdate) {
    const { doctorId, ...rest } = body;
    if (doctorId) await assertDoctorForBody(doctorId);
    const patient = await Patient.findById(id);
    if (!patient) throw ApiError.notFound('Patient not found');
    patient.set(doctorId ? { ...rest, doctor: doctorId } : rest);
    await patient.save(); // runs validators + refreshes searchTokens
    cache.clear();
    return this.getById(id);
  },

  async remove(id: string) {
    const res = await Patient.deleteOne({ _id: id });
    if (res.deletedCount === 0) throw ApiError.notFound('Patient not found');
    cache.clear();
  },

  async removeFromDoctor(doctorId: string, patientId: string) {
    const res = await Patient.deleteOne({ _id: patientId, doctor: doctorId });
    if (res.deletedCount === 0) throw ApiError.notFound('Patient not found for this doctor');
    cache.clear();
  },
};
