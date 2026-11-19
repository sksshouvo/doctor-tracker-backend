import { trusted } from 'mongoose';
import { cache, cacheKey } from '../../lib/cache.js';
import { fillBuckets, rangeToWindow, type Range } from '../../lib/dates.js';
import { Doctor } from '../doctors/doctor.model.js';
import { CONDITIONS, Patient } from '../patients/patient.model.js';

const TTL = 60_000;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

type Q = Record<string, unknown>;
const cached = <T>(route: string, q: Q, fn: () => Promise<T>) =>
  cache.wrap(cacheKey(route, q), TTL, fn);

export const dashboardService = {
  summary: (q: { range: Range; tz: string }) =>
    cached('summary', q, async () => {
      const w = rangeToWindow(q.range, q.tz);
      const [totalDoctors, totalPatients, newPatients, newPatientsPrev, criticalPatients] =
        await Promise.all([
          Doctor.estimatedDocumentCount(),
          Patient.estimatedDocumentCount(),
          Patient.countDocuments({ visitDate: trusted({ $gte: w.start, $lt: w.end }) }),
          Patient.countDocuments({ visitDate: trusted({ $gte: w.prevStart, $lt: w.prevEnd }) }),
          Patient.countDocuments({ condition: 'critical' }),
        ]);
      const newPatientsChangePct =
        newPatientsPrev === 0
          ? null
          : round(((newPatients - newPatientsPrev) / newPatientsPrev) * 100, 1);
      return {
        totalDoctors,
        totalPatients,
        newPatients,
        newPatientsPrev,
        newPatientsChangePct,
        criticalPatients,
      };
    }),

  patientsPerDoctor: (q: { limit: number }) =>
    cached('patients-per-doctor', q, async () =>
      // group first, then look up only the top N doctors
      Patient.aggregate([
        { $group: { _id: '$doctor', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: q.limit },
        {
          $lookup: {
            from: 'doctors',
            localField: '_id',
            foreignField: '_id',
            as: 'd',
            pipeline: [{ $project: { name: 1, specialization: 1 } }],
          },
        },
        { $unwind: '$d' },
        {
          $project: {
            _id: 0,
            doctorId: { $toString: '$_id' },
            name: '$d.name',
            specialization: '$d.specialization',
            count: 1,
          },
        },
      ]),
    ),

  patientsOverTime: (q: { range: Range; tz: string }) =>
    cached('patients-over-time', q, async () => {
      const w = rangeToWindow(q.range, q.tz);
      const rows = await Patient.aggregate<{ _id: Date; count: number }>([
        { $match: { visitDate: { $gte: w.start, $lt: w.end } } },
        {
          $group: {
            _id: { $dateTrunc: { date: '$visitDate', unit: w.granularity, timezone: q.tz } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      const points = fillBuckets(
        rows.map((r) => ({ date: r._id, count: r.count })),
        w,
        q.tz,
      );
      return { granularity: w.granularity, points };
    }),

  conditionDistribution: () =>
    cached('condition-distribution', {}, async () => {
      const rows = await Patient.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$condition', count: { $sum: 1 } } },
      ]);
      const m = new Map(rows.map((r) => [r._id, r.count]));
      return CONDITIONS.map((condition) => ({ condition, count: m.get(condition) ?? 0 }));
    }),

  specializationDistribution: (q: { limit: number }) =>
    cached('specialization-distribution', q, async () => {
      const rows = await Doctor.aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$specialization', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]);
      const top = rows.slice(0, q.limit).map((r) => ({ specialization: r._id, count: r.count }));
      const other = rows.slice(q.limit).reduce((s, r) => s + r.count, 0);
      return other > 0 ? [...top, { specialization: 'Other', count: other }] : top;
    }),

  recentPatients: (q: { limit: number }) =>
    cached('recent-patients', q, async () => {
      const docs = await Patient.find()
        .sort({ createdAt: -1, _id: -1 })
        .limit(q.limit)
        .populate('doctor', 'name')
        .select('name condition doctor createdAt')
        .lean();
      return docs.map((p) => {
        const d = p.doctor as unknown as { _id: unknown; name: string } | null;
        return {
          id: String(p._id),
          name: p.name,
          condition: p.condition,
          doctor: d ? { id: String(d._id), name: d.name } : null,
          createdAt: p.createdAt,
        };
      });
    }),
};
