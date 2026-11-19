import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ADMIN, app, loginAsAdmin } from './setup.js';

const api = () => request(app);
const cookieOf = (res: request.Response, name: string) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${name}=`))!;

describe('auth', () => {
  it('logs in with valid credentials and sets cookies', async () => {
    await loginAsAdmin();
    const res = await api().post('/api/v1/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(cookieOf(res, 'dt_refresh')).toMatch(/HttpOnly/i);
    expect(cookieOf(res, 'dt_refresh')).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookieOf(res, 'dt_session')).not.toMatch(/HttpOnly/i);
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    await loginAsAdmin();
    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ ...ADMIN, password: 'WrongPass123' });
    const unknown = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@x.dev', password: 'WrongPass123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('validates the login body', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: 'x', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rotates the refresh token and revokes it after logout', async () => {
    await loginAsAdmin();
    const login = await api().post('/api/v1/auth/login').send(ADMIN);
    const refreshCookie = cookieOf(login, 'dt_refresh').split(';')[0]!;

    const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', refreshCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();
    const rotated = cookieOf(refreshed, 'dt_refresh').split(';')[0]!;
    expect(rotated).not.toBe(refreshCookie);

    const logout = await api().post('/api/v1/auth/logout').set('Cookie', rotated);
    expect(logout.status).toBe(204);

    const after = await api().post('/api/v1/auth/refresh').set('Cookie', rotated);
    expect(after.status).toBe(401);
  });

  it('returns 401 for /me without a token and the user with one', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    const token = await loginAsAdmin();
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(ADMIN.email);
  });
});

describe('infrastructure', () => {
  it('health is public', async () => {
    const res = await api().get('/api/v1/health');
    expect(res.body.data).toMatchObject({ status: 'ok', db: 'up' });
  });
  it('unknown route returns the 404 envelope', async () => {
    const res = await api().get('/api/v1/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
  it.each([
    ['get', '/api/v1/doctors'],
    ['post', '/api/v1/doctors'],
    ['get', '/api/v1/doctors/options'],
    ['get', '/api/v1/doctors/facets'],
    ['get', '/api/v1/doctors/507f1f77bcf86cd799439011'],
    ['get', '/api/v1/doctors/507f1f77bcf86cd799439011/patients'],
    ['get', '/api/v1/patients'],
    ['post', '/api/v1/patients'],
    ['delete', '/api/v1/patients/507f1f77bcf86cd799439011'],
    ['get', '/api/v1/dashboard/summary'],
    ['get', '/api/v1/dashboard/patients-per-doctor'],
    ['get', '/api/v1/dashboard/patients-over-time'],
    ['get', '/api/v1/dashboard/condition-distribution'],
    ['get', '/api/v1/dashboard/specialization-distribution'],
    ['get', '/api/v1/dashboard/recent-patients'],
  ] as const)('%s %s requires auth', async (method, path) => {
    const res = await api()[method](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
