import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import * as c from './dashboard.controller.js';
import * as q from './dashboard.schemas.js';

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth, requireRole('admin'));

dashboardRoutes.get('/summary', validate({ query: q.summaryQuery }), c.summary);
dashboardRoutes.get(
  '/patients-per-doctor',
  validate({ query: q.perDoctorQuery }),
  c.patientsPerDoctor,
);
dashboardRoutes.get(
  '/patients-over-time',
  validate({ query: q.overTimeQuery }),
  c.patientsOverTime,
);
dashboardRoutes.get('/condition-distribution', c.conditionDistribution);
dashboardRoutes.get(
  '/specialization-distribution',
  validate({ query: q.specializationQuery }),
  c.specializationDistribution,
);
dashboardRoutes.get('/recent-patients', validate({ query: q.recentQuery }), c.recentPatients);
