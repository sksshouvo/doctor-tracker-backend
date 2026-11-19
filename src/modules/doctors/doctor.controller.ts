import type { RequestHandler } from 'express';
import { ok, noContent, paginated } from '../../lib/apiResponse.js';
import { patientService } from '../patients/patient.service.js';
import { doctorService } from './doctor.service.js';

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await doctorService.list(req.validated.query);
  paginated(res, data, meta);
};

export const options: RequestHandler = async (req, res) => {
  const { q, limit } = req.validated.query;
  ok(res, await doctorService.options(q, limit));
};

export const facets: RequestHandler = async (_req, res) => ok(res, await doctorService.facets());

export const create: RequestHandler = async (req, res) =>
  ok(res, await doctorService.create(req.validated.body), 201);

export const getOne: RequestHandler = async (req, res) =>
  ok(res, await doctorService.getById(req.validated.params.id));

export const update: RequestHandler = async (req, res) =>
  ok(res, await doctorService.update(req.validated.params.id, req.validated.body));

export const remove: RequestHandler = async (req, res) => {
  await doctorService.remove(req.validated.params.id);
  noContent(res);
};

// --- doctor -> patients sub-resource ---
export const listPatients: RequestHandler = async (req, res) => {
  const { id } = req.validated.params;
  await doctorService.assertExists(id);
  const { data, meta } = await patientService.list({ ...req.validated.query, doctorId: id });
  paginated(res, data, meta);
};

export const createPatient: RequestHandler = async (req, res) =>
  ok(res, await patientService.createForDoctor(req.validated.params.id, req.validated.body), 201);

export const removePatient: RequestHandler = async (req, res) => {
  const { id, patientId } = req.validated.params;
  await patientService.removeFromDoctor(id, patientId);
  noContent(res);
};
