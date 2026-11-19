import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, authed, loginAsAdmin, makeDoctor, makePatient } from './setup.js';

let token: string;
beforeEach(async () => {
  token = await loginAsAdmin();
});
const get = (url: string) => request(app).get(url).set(authed(token));

const body = {
  name: 'Dr. Ayesha Rahman',
  specialization: 'Cardiology',
  hospital: 'Square Hospital',
  phone: '+8801711000000',
  email: 'Ayesha@Example.com',
};

describe('doctors CRUD', () => {
  it('creates a doctor (201) and normalises email', async () => {
    const res = await request(app).post('/api/v1/doctors').set(authed(token)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: body.name,
      email: 'ayesha@example.com',
      patientCount: 0,
    });
    expect(res.body.data.searchTokens).toBeUndefined();
    expect(res.body.data._id).toBeUndefined();
  });

  it.each([
    ['name', { name: 'D' }],
    ['specialization', { specialization: '' }],
    ['hospital', { hospital: 'x' }],
    ['phone', { phone: 'abc' }],
    ['email', { email: 'not-an-email' }],
  ])('rejects an invalid %s (400)', async (field, patch) => {
    const res = await request(app)
      .post('/api/v1/doctors')
      .set(authed(token))
      .send({ ...body, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
  });

  it('rejects unknown fields (strict) and NoSQL operators', async () => {
    const extra = await request(app)
      .post('/api/v1/doctors')
      .set(authed(token))
      .send({ ...body, searchTokens: ['x'] });
    expect(extra.status).toBe(400);
    const inj = await request(app)
      .post('/api/v1/doctors')
      .set(authed(token))
      .send({ ...body, email: { $ne: '' } });
    expect(inj.status).toBe(400);
  });

  it('rejects duplicate email (409)', async () => {
    await request(app).post('/api/v1/doctors').set(authed(token)).send(body);
    const res = await request(app).post('/api/v1/doctors').set(authed(token)).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_EMAIL');
  });

  it('gets a doctor with stats and 404s on unknown / 400s on malformed id', async () => {
    const d = await makeDoctor();
    await makePatient(d._id, { condition: 'critical' });
    await makePatient(d._id, { condition: 'stable' });
    await makePatient(d._id, { condition: 'stable' });
    const res = await get(`/api/v1/doctors/${d._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toEqual({
      totalPatients: 3,
      byCondition: { stable: 2, critical: 1, recovering: 0, under_observation: 0, discharged: 0 },
    });
    expect((await get('/api/v1/doctors/507f1f77bcf86cd799439011')).status).toBe(404);
    expect((await get('/api/v1/doctors/not-an-id')).status).toBe(400);
  });

  it('updates a doctor, refreshes search tokens, 404 and 409', async () => {
    const d = await makeDoctor();
    const other = await makeDoctor();
    const res = await request(app)
      .patch(`/api/v1/doctors/${d._id}`)
      .set(authed(token))
      .send({ name: 'Zorro Quill' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Zorro Quill');
    expect((await get('/api/v1/doctors?q=zor')).body.data).toHaveLength(1);

    expect(
      (await request(app).patch(`/api/v1/doctors/${d._id}`).set(authed(token)).send({})).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch('/api/v1/doctors/507f1f77bcf86cd799439011')
          .set(authed(token))
          .send({ name: 'Abc' })
      ).status,
    ).toBe(404);
    const dup = await request(app)
      .patch(`/api/v1/doctors/${d._id}`)
      .set(authed(token))
      .send({ email: other.email });
    expect(dup.status).toBe(409);
  });

  it('blocks deleting a doctor with patients (409) and deletes otherwise (204)', async () => {
    const d = await makeDoctor();
    await makePatient(d._id);
    const blocked = await request(app).delete(`/api/v1/doctors/${d._id}`).set(authed(token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DOCTOR_HAS_PATIENTS');
    expect(blocked.body.error.details).toEqual([{ path: 'patients', message: '1' }]);

    const free = await makeDoctor();
    expect(
      (await request(app).delete(`/api/v1/doctors/${free._id}`).set(authed(token))).status,
    ).toBe(204);
    expect(
      (await request(app).delete(`/api/v1/doctors/${free._id}`).set(authed(token))).status,
    ).toBe(404);
  });
});

describe('doctors list', () => {
  it('sorts newest first by default with pagination meta and patientCount', async () => {
    const docs = [];
    for (let i = 0; i < 12; i++) {
      docs.push(await makeDoctor({ createdAt: new Date(2026, 0, i + 1) }));
    }
    await makePatient(docs[11]!._id);
    await makePatient(docs[11]!._id);
    const res = await get('/api/v1/doctors?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.data[0].id).toBe(String(docs[11]!._id));
    expect(res.body.data[0].patientCount).toBe(2);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 10,
      total: 12,
      totalPages: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });

    const p2 = await get('/api/v1/doctors?limit=10&page=2');
    expect(p2.body.data).toHaveLength(2);
    expect(p2.body.meta).toMatchObject({ hasNextPage: false, hasPrevPage: true });

    const beyond = await get('/api/v1/doctors?page=9');
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta).toMatchObject({ page: 9, total: 12, totalPages: 2 });
  });

  it('rejects invalid limit and reversed date ranges', async () => {
    expect((await get('/api/v1/doctors?limit=101')).status).toBe(400);
    expect((await get('/api/v1/doctors?limit=7')).status).toBe(400);
    expect((await get('/api/v1/doctors?from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await get('/api/v1/doctors?sort=passwordHash')).status).toBe(400);
  });

  it('prefix-searches multiple words case/diacritic-insensitively and escapes regex input', async () => {
    await makeDoctor({
      name: 'Dr. John Smith',
      email: 'js@example.com',
      specialization: 'Oncology',
    });
    await makeDoctor({
      name: 'Dr. John Carter',
      email: 'jc@example.com',
      specialization: 'Oncology',
    });
    await makeDoctor({
      name: 'Dr. José Álvarez',
      email: 'ja@example.com',
      specialization: 'Oncology',
    });
    expect((await get('/api/v1/doctors?q=john')).body.data).toHaveLength(2);
    expect((await get('/api/v1/doctors?q=JOHN car')).body.data).toHaveLength(1);
    expect((await get('/api/v1/doctors?q=jose')).body.data).toHaveLength(1);
    expect((await get('/api/v1/doctors?q=.*')).body.data).toHaveLength(0);
    expect((await get('/api/v1/doctors?q=(')).status).toBe(200);
  });

  it('filters by specialization, hospital and date range together', async () => {
    await makeDoctor({
      specialization: 'Cardiology',
      hospital: 'Hosp A',
      createdAt: new Date('2026-03-10T05:00:00Z'),
    });
    await makeDoctor({
      specialization: 'Neurology',
      hospital: 'Hosp A',
      createdAt: new Date('2026-03-12T05:00:00Z'),
    });
    await makeDoctor({
      specialization: 'Neurology',
      hospital: 'Hosp B',
      createdAt: new Date('2026-04-01T05:00:00Z'),
    });
    expect((await get('/api/v1/doctors?specialization=Cardiology,Neurology')).body.meta.total).toBe(
      3,
    );
    expect(
      (await get('/api/v1/doctors?specialization=Neurology&hospital=Hosp A')).body.meta.total,
    ).toBe(1);
    expect((await get('/api/v1/doctors?from=2026-03-01&to=2026-03-31')).body.meta.total).toBe(2);
    expect(
      (await get('/api/v1/doctors?specialization=Neurology&from=2026-03-11&to=2026-03-12')).body
        .meta.total,
    ).toBe(1);
  });

  it('sorts by name and by patientCount', async () => {
    const a = await makeDoctor({ name: 'Bravo Doc' });
    const b = await makeDoctor({ name: 'Alpha Doc' });
    await makePatient(a._id);
    await makePatient(a._id);
    await makePatient(b._id);
    const byName = await get('/api/v1/doctors?sort=name');
    expect(byName.body.data.map((d: { name: string }) => d.name)).toEqual([
      'Alpha Doc',
      'Bravo Doc',
    ]);
    const byCount = await get('/api/v1/doctors?sort=-patientCount');
    expect(byCount.body.data.map((d: { patientCount: number }) => d.patientCount)).toEqual([2, 1]);
    const asc = await get('/api/v1/doctors?sort=patientCount');
    expect(asc.body.data.map((d: { patientCount: number }) => d.patientCount)).toEqual([1, 2]);
    expect(byCount.body.meta.total).toBe(2);
  });

  it('serves options and facets', async () => {
    await makeDoctor({ name: 'Zed Doc', specialization: 'Oncology', hospital: 'Hosp 2' });
    await makeDoctor({ name: 'Amy Doc', specialization: 'Cardiology', hospital: 'Hosp 1' });
    const opts = await get('/api/v1/doctors/options?q=amy');
    expect(opts.body.data).toEqual([
      expect.objectContaining({ name: 'Amy Doc', specialization: 'Cardiology' }),
    ]);
    expect(Object.keys(opts.body.data[0]).sort()).toEqual(['id', 'name', 'specialization']);
    const facets = await get('/api/v1/doctors/facets');
    expect(facets.body.data).toEqual({
      specializations: ['Cardiology', 'Oncology'],
      hospitals: ['Hosp 1', 'Hosp 2'],
    });
  });
});

describe('doctor -> patients sub-resource', () => {
  const pBody = {
    name: 'Rina Akter',
    age: 31,
    gender: 'female',
    phone: '+8801811223344',
    diagnosis: 'Migraine',
    condition: 'under_observation',
    visitDate: '2026-11-18',
  };

  it('creates, lists and deletes patients of a doctor', async () => {
    const d = await makeDoctor();
    const other = await makeDoctor();
    const created = await request(app)
      .post(`/api/v1/doctors/${d._id}/patients`)
      .set(authed(token))
      .send(pBody);
    expect(created.status).toBe(201);
    expect(created.body.data.doctor).toMatchObject({ id: String(d._id), name: d.name });
    await makePatient(other._id);

    const list = await get(`/api/v1/doctors/${d._id}/patients`);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].name).toBe('Rina Akter');
    expect((await get('/api/v1/doctors/507f1f77bcf86cd799439011/patients')).status).toBe(404);

    const pid = created.body.data.id;
    const wrong = await request(app)
      .delete(`/api/v1/doctors/${other._id}/patients/${pid}`)
      .set(authed(token));
    expect(wrong.status).toBe(404);
    const del = await request(app)
      .delete(`/api/v1/doctors/${d._id}/patients/${pid}`)
      .set(authed(token));
    expect(del.status).toBe(204);
  });

  it('404s when creating a patient for an unknown doctor', async () => {
    const res = await request(app)
      .post('/api/v1/doctors/507f1f77bcf86cd799439011/patients')
      .set(authed(token))
      .send(pBody);
    expect(res.status).toBe(404);
  });
});
