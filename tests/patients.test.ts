import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, authed, loginAsAdmin, makeDoctor, makePatient } from './setup.js';

let token: string;
beforeEach(async () => {
  token = await loginAsAdmin();
});
const get = (url: string) => request(app).get(url).set(authed(token));
const ids = (res: request.Response) => res.body.data.map((p: { name: string }) => p.name);

const valid = {
  name: 'Karim Hossain',
  age: 54,
  gender: 'male',
  phone: '+8801711000000',
  diagnosis: 'Hypertension',
  condition: 'stable',
  visitDate: '2026-10-02',
};

describe('patients write', () => {
  it('creates a patient (201) with a populated doctor', async () => {
    const d = await makeDoctor();
    const res = await request(app)
      .post('/api/v1/patients')
      .set(authed(token))
      .send({ ...valid, email: '', doctorId: String(d._id) });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Karim Hossain',
      email: null,
      doctor: { id: String(d._id), name: d.name, specialization: 'Cardiology' },
    });
  });

  it('returns 400 with details.path=doctorId for a missing doctor', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set(authed(token))
      .send({ ...valid, doctorId: '507f1f77bcf86cd799439011' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('doctorId');
  });

  it.each([
    ['age', { age: 131 }],
    ['age', { age: -1 }],
    ['gender', { gender: 'x' }],
    ['condition', { condition: 'unknown' }],
    ['visitDate', { visitDate: '2999-01-01' }],
    ['bloodGroup', { bloodGroup: 'Z+' }],
    ['phone', { phone: 'nope' }],
  ])('rejects invalid %s', async (field, patch) => {
    const d = await makeDoctor();
    const res = await request(app)
      .post('/api/v1/patients')
      .set(authed(token))
      .send({ ...valid, doctorId: String(d._id), ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((x: { path: string }) => x.path)).toContain(field);
  });

  it('updates a patient and reassigns the doctor', async () => {
    const a = await makeDoctor();
    const b = await makeDoctor();
    const p = await makePatient(a._id);
    const res = await request(app)
      .patch(`/api/v1/patients/${p._id}`)
      .set(authed(token))
      .send({ condition: 'critical', doctorId: String(b._id), name: 'Renamed Person' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ condition: 'critical', doctor: { id: String(b._id) } });
    expect((await get('/api/v1/patients?q=renamed')).body.meta.total).toBe(1);
    expect((await get(`/api/v1/doctors/${a._id}/patients`)).body.meta.total).toBe(0);

    const bad = await request(app)
      .patch(`/api/v1/patients/${p._id}`)
      .set(authed(token))
      .send({ doctorId: '507f1f77bcf86cd799439011' });
    expect(bad.status).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/v1/patients/507f1f77bcf86cd799439011')
          .set(authed(token))
          .send({ age: 3 })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).patch(`/api/v1/patients/${p._id}`).set(authed(token)).send({})).status,
    ).toBe(400);
  });

  it('clears optional fields sent as empty strings without touching the others', async () => {
    const d = await makeDoctor();
    const p = await makePatient(d._id, { email: 'a@b.co', address: 'Road 1', notes: 'keep me' });
    const res = await request(app)
      .patch(`/api/v1/patients/${p._id}`)
      .set(authed(token))
      .send({ email: '', address: '' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: null, address: null, notes: 'keep me' });
  });

  it('gets one and deletes (204 then 404)', async () => {
    const d = await makeDoctor();
    const p = await makePatient(d._id);
    expect((await get(`/api/v1/patients/${p._id}`)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/patients/${p._id}`).set(authed(token))).status).toBe(
      204,
    );
    expect((await request(app).delete(`/api/v1/patients/${p._id}`).set(authed(token))).status).toBe(
      404,
    );
    expect((await get(`/api/v1/patients/${p._id}`)).status).toBe(404);
  });
});

describe('patients list', () => {
  it('applies each filter and combinations', async () => {
    const a = await makeDoctor();
    const b = await makeDoctor();
    await makePatient(a._id, {
      name: 'Karim Ali',
      condition: 'critical',
      gender: 'male',
      visitDate: new Date('2026-10-05T06:00:00Z'),
      diagnosis: 'Asthma',
    });
    await makePatient(a._id, {
      name: 'Kara Lee',
      condition: 'recovering',
      gender: 'female',
      visitDate: new Date('2026-10-20T06:00:00Z'),
    });
    await makePatient(b._id, {
      name: 'Zed Mark',
      condition: 'stable',
      gender: 'male',
      visitDate: new Date('2026-09-01T06:00:00Z'),
    });

    expect((await get('/api/v1/patients')).body.meta.total).toBe(3);
    expect(ids(await get('/api/v1/patients?q=kar'))).toEqual(['Kara Lee', 'Karim Ali']);
    expect(ids(await get('/api/v1/patients?q=asthma'))).toEqual(['Karim Ali']);
    expect((await get('/api/v1/patients?condition=critical,recovering')).body.meta.total).toBe(2);
    expect((await get(`/api/v1/patients?doctorId=${b._id}`)).body.meta.total).toBe(1);
    expect(ids(await get('/api/v1/patients?gender=female'))).toEqual(['Kara Lee']);
    expect((await get('/api/v1/patients?from=2026-10-01&to=2026-10-31')).body.meta.total).toBe(2);
    expect(
      (
        await get(
          `/api/v1/patients?q=kar&condition=critical&doctorId=${a._id}&from=2026-10-01&to=2026-10-10`,
        )
      ).body.meta.total,
    ).toBe(1);
  });

  it('filters on createdAt when dateField=createdAt', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, {
      createdAt: new Date('2026-01-10T06:00:00Z'),
      visitDate: new Date('2026-10-10T06:00:00Z'),
    });
    expect((await get('/api/v1/patients?from=2026-01-01&to=2026-01-31')).body.meta.total).toBe(0);
    expect(
      (await get('/api/v1/patients?from=2026-01-01&to=2026-01-31&dateField=createdAt')).body.meta
        .total,
    ).toBe(1);
  });

  it('sorts by visitDate desc (default), age and name; page bounds are stable', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, { name: 'Bob One', age: 30, visitDate: new Date('2026-01-01') });
    await makePatient(d._id, { name: 'Al Two', age: 70, visitDate: new Date('2026-03-01') });
    await makePatient(d._id, { name: 'Cy Three', age: 50, visitDate: new Date('2026-02-01') });
    expect(ids(await get('/api/v1/patients'))).toEqual(['Al Two', 'Cy Three', 'Bob One']);
    expect(ids(await get('/api/v1/patients?sort=-age'))).toEqual(['Al Two', 'Cy Three', 'Bob One']);
    expect(ids(await get('/api/v1/patients?sort=age'))).toEqual(['Bob One', 'Cy Three', 'Al Two']);
    expect(ids(await get('/api/v1/patients?sort=name'))).toEqual(['Al Two', 'Bob One', 'Cy Three']);

    const beyond = await get('/api/v1/patients?page=5');
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta).toMatchObject({
      page: 5,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: true,
    });
  });

  it('never repeats rows across pages when sort keys tie', async () => {
    const d = await makeDoctor();
    const same = new Date('2026-05-05');
    for (let i = 0; i < 25; i++) await makePatient(d._id, { visitDate: same });
    const seen = new Set<string>();
    for (const page of [1, 2, 3]) {
      const res = await get(`/api/v1/patients?limit=10&page=${page}`);
      for (const p of res.body.data) seen.add(p.id);
    }
    expect(seen.size).toBe(25);
  });

  it('validates query params', async () => {
    expect((await get('/api/v1/patients?condition=bogus')).status).toBe(400);
    expect((await get('/api/v1/patients?doctorId=bad')).status).toBe(400);
    expect((await get('/api/v1/patients?dateField=name')).status).toBe(400);
  });
});
