import { connectDb, disconnectDb } from '../config/db.js';
import { Doctor } from '../modules/doctors/doctor.model.js';
import { Patient } from '../modules/patients/patient.model.js';
import { User } from '../modules/users/user.model.js';

await connectDb();
await Promise.all([User.syncIndexes(), Doctor.syncIndexes(), Patient.syncIndexes()]);
console.log('Indexes synced');
await disconnectDb();
