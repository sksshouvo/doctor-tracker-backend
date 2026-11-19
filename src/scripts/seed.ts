import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';
import { Types } from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { Doctor } from '../modules/doctors/doctor.model.js';
import { Patient } from '../modules/patients/patient.model.js';
import { User } from '../modules/users/user.model.js';
import { buildSearchTokens } from '../utils/searchTokens.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name: string) => process.argv.includes(`--${name}`);

const DOCTORS = Number(arg('doctors') ?? env.SEED_DOCTORS);
const PATIENTS = Number(arg('patients') ?? env.SEED_PATIENTS);
const BATCH = 1000;

const SPECIALIZATIONS = [
  'Cardiology',
  'Neurology',
  'Pediatrics',
  'Orthopedics',
  'Dermatology',
  'Oncology',
  'Gynecology',
  'Psychiatry',
  'ENT',
  'Ophthalmology',
  'Gastroenterology',
  'Nephrology',
  'Pulmonology',
  'Endocrinology',
  'General Medicine',
];
const HOSPITALS = [
  'Square Hospital',
  'United Hospital',
  'Evercare Hospital',
  'Labaid Hospital',
  'Popular Medical Centre',
  'Ibn Sina Hospital',
  'Apollo Hospital',
  'Central Hospital',
  'BSMMU',
  'Dhaka Medical College Hospital',
  'Samorita Hospital',
  'Green Life Hospital',
];
const DIAGNOSES = [
  'Hypertension',
  'Type 2 Diabetes',
  'Migraine',
  'Asthma',
  'Fractured wrist',
  'Eczema',
  'Anxiety disorder',
  'Gastritis',
  'Kidney stones',
  'Pneumonia',
  'Thyroid disorder',
  'Arrhythmia',
  'Sinusitis',
  'Cataract',
  'Lower back pain',
  'Anemia',
  'Bronchitis',
  'Appendicitis',
  'Allergic rhinitis',
  'Coronary artery disease',
];
const CONDITIONS = [
  ['stable', 0.4],
  ['recovering', 0.25],
  ['under_observation', 0.15],
  ['discharged', 0.12],
  ['critical', 0.08],
] as const;
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const DAY = 86_400_000;

function pickWeighted<T extends string>(table: readonly (readonly [T, number])[]): T {
  let r = Math.random();
  for (const [v, w] of table) if ((r -= w) <= 0) return v;
  return table[0]![0];
}

const phone = () => `+8801${faker.number.int({ min: 3, max: 9 })}${faker.string.numeric(8)}`;

async function main() {
  await connectDb();
  if (flag('reset')) {
    await Promise.all([
      Doctor.collection.drop().catch(() => 0),
      Patient.collection.drop().catch(() => 0),
    ]);
    if (flag('reset-users')) await User.collection.drop().catch(() => 0);
  }
  await Promise.all([User.syncIndexes(), Doctor.syncIndexes(), Patient.syncIndexes()]);

  // 1) admin (idempotent upsert)
  const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12);
  await User.updateOne(
    { email: env.SEED_ADMIN_EMAIL.toLowerCase() },
    {
      $set: { name: env.SEED_ADMIN_NAME, passwordHash, role: 'admin' },
      $setOnInsert: { tokenVersion: 0, createdAt: new Date() },
    },
    { upsert: true },
  );

  // 2) doctors, createdAt spread over the last 18 months
  const now = Date.now();
  const existingDoctors = await Doctor.estimatedDocumentCount();
  const start = existingDoctors;
  const doctors = Array.from({ length: DOCTORS }, (_, i) => {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const name = `Dr. ${first} ${last}`;
    const specialization = faker.helpers.arrayElement(SPECIALIZATIONS);
    const hospital = faker.helpers.arrayElement(HOSPITALS);
    const email = `${first}.${last}.${start + i}@example.com`
      .toLowerCase()
      .replace(/[^a-z0-9.@]/g, '');
    const createdAt = new Date(now - Math.random() * 548 * DAY);
    return {
      _id: new Types.ObjectId(),
      name,
      specialization,
      hospital,
      phone: phone(),
      email,
      searchTokens: buildSearchTokens(name, specialization, hospital, email),
      createdAt,
      updatedAt: createdAt,
    };
  });
  await Doctor.collection.insertMany(doctors, { ordered: false });

  // 3) patients, skewed so a few doctors are very busy
  const allDoctors = await Doctor.find().select('_id').lean();
  const weights = allDoctors.map(() => Math.pow(Math.random(), 3) + 0.02);
  const cumulative: number[] = [];
  weights.reduce((s, w, i) => ((cumulative[i] = s + w), s + w), 0);
  const totalW = cumulative[cumulative.length - 1]!;
  const pickDoctor = () => {
    const r = Math.random() * totalW;
    let lo = 0,
      hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid]! < r) lo = mid + 1;
      else hi = mid;
    }
    return allDoctors[lo]!._id;
  };

  for (let done = 0; done < PATIENTS; done += BATCH) {
    const size = Math.min(BATCH, PATIENTS - done);
    const batch = Array.from({ length: size }, () => {
      const name = faker.person.fullName();
      const diagnosis = faker.helpers.arrayElement(DIAGNOSES);
      const email =
        Math.random() < 0.6
          ? faker.internet.email({ provider: 'example.com' }).toLowerCase()
          : undefined;
      const ph = phone();
      // more recent visits are more likely
      const visitDate = new Date(now - Math.pow(Math.random(), 1.25) * 365 * DAY);
      const createdAt = new Date(Math.min(now, visitDate.getTime() + Math.random() * 2 * DAY));
      return {
        name,
        age: faker.number.int({ min: 1, max: 95 }),
        gender: faker.helpers.arrayElement(['male', 'female', 'other'] as const),
        phone: ph,
        ...(email ? { email } : {}),
        ...(Math.random() < 0.5 ? { address: faker.location.streetAddress() } : {}),
        ...(Math.random() < 0.7 ? { bloodGroup: faker.helpers.arrayElement(BLOOD) } : {}),
        diagnosis,
        condition: pickWeighted(CONDITIONS),
        visitDate,
        ...(Math.random() < 0.3 ? { notes: faker.lorem.sentence() } : {}),
        doctor: pickDoctor(),
        searchTokens: buildSearchTokens(name, diagnosis, email, ph),
        createdAt,
        updatedAt: createdAt,
      };
    });
    await Patient.collection.insertMany(batch, { ordered: false });
  }

  const [d, p, u] = await Promise.all([
    Doctor.countDocuments(),
    Patient.countDocuments(),
    User.countDocuments(),
  ]);
  console.log(`Seeded: ${d} doctors, ${p} patients, ${u} users`);
  console.log(`Admin login: ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}`);
  await disconnectDb();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDb().catch(() => 0);
  process.exit(1);
});
