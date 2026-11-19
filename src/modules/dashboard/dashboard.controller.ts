import type { RequestHandler } from 'express';
import { ok } from '../../lib/apiResponse.js';
import { dashboardService as s } from './dashboard.service.js';

export const summary: RequestHandler = async (req, res) =>
  ok(res, await s.summary(req.validated.query));
export const patientsPerDoctor: RequestHandler = async (req, res) =>
  ok(res, await s.patientsPerDoctor(req.validated.query));
export const patientsOverTime: RequestHandler = async (req, res) =>
  ok(res, await s.patientsOverTime(req.validated.query));
export const conditionDistribution: RequestHandler = async (_req, res) =>
  ok(res, await s.conditionDistribution());
export const specializationDistribution: RequestHandler = async (req, res) =>
  ok(res, await s.specializationDistribution(req.validated.query));
export const recentPatients: RequestHandler = async (req, res) =>
  ok(res, await s.recentPatients(req.validated.query));
