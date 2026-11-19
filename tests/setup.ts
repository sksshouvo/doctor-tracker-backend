import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createApp } from '../src/app.js';
import { cache } from '../src/lib/cache.js';
import { Doctor } from '../src/modules/doctors/doctor.model.js';
import { Patient } from '../src/modules/patients/patient.model.js';
import { User } from '../src/modules/users/user.model.js';

let mongod: MongoMemoryServer;
export const app = createApp();
export const ADMIN = { email: 'admin@test.dev', password: 'Admin@12345' };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  mongoose.set('strictQuery', true);
  mongoose.set('sanitizeFilter', true);
  await mongoose.connect(mongod.getUri('test'));
  await Promise.all([User.syncIndexes(), Doctor.syncIndexes(), Patient.syncIndexes()]);
});

afterEach(async () => {
  cache.clear();
  await Promise.all([User.deleteMany({}), Doctor.deleteMany({}), Patient.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

export async function loginAsAdmin(): Promise<string> {
  await User.create({
    name: 'Admin',
    email: ADMIN.email,
    passwordHash: await bcrypt.hash(ADMIN.password, 4),
  });
  const res = await request(app).post('/api/v1/auth/login').send(ADMIN);
  return res.body.data.accessToken as string;
}

let n = 0;
type Made = { _id: Types.ObjectId; name: string; email?: string | null };

export async function makeDoctor(overrides: Record<string, unknown> = {}): Promise<Made> {
  n++;
  return Doctor.create({
    name: `Dr. Test ${n}`,
    specialization: 'Cardiology',
    hospital: 'City Hospital',
    phone: '+8801711000000',
    email: `doc${n}@example.com`,
    ...overrides,
  });
}

export async function makePatient(
  doctorId: Types.ObjectId | string,
  overrides: Record<string, unknown> = {},
): Promise<Made> {
  n++;
  return Patient.create({
    name: `Patient ${n}`,
    age: 40,
    gender: 'male',
    phone: '+8801811000000',
    diagnosis: 'Hypertension',
    condition: 'stable',
    visitDate: new Date(Date.now() - 86_400_000),
    doctor: doctorId,
    ...overrides,
  });
}

export const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
