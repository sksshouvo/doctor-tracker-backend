import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from './lib/apiResponse.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { doctorRoutes } from './modules/doctors/doctor.routes.js';
import { patientRoutes } from './modules/patients/patient.routes.js';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  let db: 'up' | 'down' = 'down';
  try {
    await mongoose.connection.db?.admin().ping();
    db = 'up';
  } catch {
    /* db stays down */
  }
  ok(res, { status: 'ok', db, uptime: Math.round(process.uptime()) });
});

routes.use('/auth', authRoutes);
routes.use('/doctors', doctorRoutes);
routes.use('/patients', patientRoutes);
routes.use('/dashboard', dashboardRoutes);
