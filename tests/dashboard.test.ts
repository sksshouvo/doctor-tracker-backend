import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, authed, loginAsAdmin, makeDoctor, makePatient } from './setup.js';
import { localMidnightToUtc, rangeToWindow } from '../src/lib/dates.js';

let token: string;
beforeEach(async () => {
  token = await loginAsAdmin();
});
const get = (url: string) => request(app).get(url).set(authed(token));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe('dashboard', () => {
  it('summary returns exact totals and change %', async () => {
    const d = await makeDoctor();
    await makeDoctor();
    for (let i = 0; i < 3; i++) await makePatient(d._id, { visitDate: daysAgo(2) });
    await makePatient(d._id, { visitDate: daysAgo(2), condition: 'critical' });
    for (let i = 0; i < 2; i++) await makePatient(d._id, { visitDate: daysAgo(40) }); // previous 30d window
    const res = await get('/api/v1/dashboard/summary?range=30d');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalDoctors: 2,
      totalPatients: 6,
      newPatients: 4,
      newPatientsPrev: 2,
      newPatientsChangePct: 100,
      criticalPatients: 1,
    });
  });

  it('summary change % is null when the previous period is empty', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, { visitDate: daysAgo(1) });
    const res = await get('/api/v1/dashboard/summary?range=7d');
    expect(res.body.data.newPatientsChangePct).toBeNull();
  });

  it('patients-per-doctor is ordered desc and limited', async () => {
    const a = await makeDoctor({ name: 'Few Patients' });
    const b = await makeDoctor({ name: 'Many Patients' });
    await makePatient(a._id);
    for (let i = 0; i < 3; i++) await makePatient(b._id);
    const res = await get('/api/v1/dashboard/patients-per-doctor?limit=10');
    expect(res.body.data.map((r: { name: string; count: number }) => [r.name, r.count])).toEqual([
      ['Many Patients', 3],
      ['Few Patients', 1],
    ]);
    expect(res.body.data[0].doctorId).toBe(String(b._id));
    expect((await get('/api/v1/dashboard/patients-per-doctor?limit=1')).body.data).toHaveLength(1);
    expect((await get('/api/v1/dashboard/patients-per-doctor?limit=99')).status).toBe(400);
  });

  it('patients-over-time zero-fills: 30d => 30 daily points, 12m => 12 monthly points', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, { visitDate: daysAgo(1) });
    await makePatient(d._id, { visitDate: daysAgo(1) });
    const res = await get('/api/v1/dashboard/patients-over-time?range=30d');
    expect(res.body.data.granularity).toBe('day');
    expect(res.body.data.points).toHaveLength(30);
    expect(res.body.data.points.reduce((s: number, p: { count: number }) => s + p.count, 0)).toBe(
      2,
    );

    const m = await get('/api/v1/dashboard/patients-over-time?range=12m');
    expect(m.body.data.granularity).toBe('month');
    expect(m.body.data.points).toHaveLength(12);
    expect(m.body.data.points[0].date).toMatch(/^\d{4}-\d{2}-01$/);

    expect(
      (await get('/api/v1/dashboard/patients-over-time?range=7d')).body.data.points,
    ).toHaveLength(7);
    expect((await get('/api/v1/dashboard/patients-over-time?tz=Nope/Zone')).status).toBe(400);
  });

  it('buckets by the local day: a 23:30 Asia/Dhaka visit counts on that local day', async () => {
    const d = await makeDoctor();
    const w = rangeToWindow('7d', 'Asia/Dhaka');
    const key = w.keys[3]!; // a local day inside the window
    const [y, m, day] = key.split('-').map(Number) as [number, number, number];
    const localMidnight = localMidnightToUtc(y, m, day, 'Asia/Dhaka');
    const at2330 = new Date(localMidnight.getTime() + (23 * 60 + 30) * 60_000); // 23:30 local = 17:30 UTC
    const at0010Next = new Date(localMidnight.getTime() + (24 * 60 + 10) * 60_000);
    await makePatient(d._id, { visitDate: at2330 });
    await makePatient(d._id, { visitDate: at0010Next });
    const res = await get('/api/v1/dashboard/patients-over-time?range=7d&tz=Asia/Dhaka');
    const byDate = Object.fromEntries(
      res.body.data.points.map((p: { date: string; count: number }) => [p.date, p.count]),
    );
    expect(byDate[key]).toBe(1);
    expect(byDate[w.keys[4]!]).toBe(1);
  });

  it('condition-distribution always returns all five conditions', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, { condition: 'critical' });
    const res = await get('/api/v1/dashboard/condition-distribution');
    expect(res.body.data).toEqual([
      { condition: 'stable', count: 0 },
      { condition: 'critical', count: 1 },
      { condition: 'recovering', count: 0 },
      { condition: 'under_observation', count: 0 },
      { condition: 'discharged', count: 0 },
    ]);
  });

  it('specialization-distribution groups the tail into Other', async () => {
    for (const s of ['Aa1', 'Aa1', 'Aa1', 'Bb2', 'Bb2', 'Cc3', 'Dd4'])
      await makeDoctor({ specialization: s });
    const res = await get('/api/v1/dashboard/specialization-distribution?limit=2');
    expect(res.body.data).toEqual([
      { specialization: 'Aa1', count: 3 },
      { specialization: 'Bb2', count: 2 },
      { specialization: 'Other', count: 2 },
    ]);
  });

  it('recent-patients returns newest first', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, { name: 'Older One', createdAt: daysAgo(3) });
    await makePatient(d._id, { name: 'Newest One', createdAt: daysAgo(1) });
    const res = await get('/api/v1/dashboard/recent-patients?limit=1');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      name: 'Newest One',
      doctor: { id: String(d._id), name: d.name },
    });
  });

  it('caches for 60s and clears the cache on writes', async () => {
    const d = await makeDoctor();
    expect((await get('/api/v1/dashboard/summary')).body.data.totalPatients).toBe(0);
    await makePatient(d._id); // direct insert: cache is not cleared -> stale (cached)
    expect((await get('/api/v1/dashboard/summary')).body.data.totalPatients).toBe(0);
    await request(app).post(`/api/v1/doctors/${d._id}/patients`).set(authed(token)).send({
      name: 'Via Api',
      age: 5,
      gender: 'other',
      phone: '+8801711000000',
      diagnosis: 'Flu',
      condition: 'stable',
      visitDate: '2026-01-01',
    });
    expect((await get('/api/v1/dashboard/summary')).body.data.totalPatients).toBe(2);
  });
});
