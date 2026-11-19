import type { RequestHandler } from 'express';
import { ok, noContent, paginated } from '../../lib/apiResponse.js';
import { patientService } from './patient.service.js';

export const list: RequestHandler = async (req, res) => {
  const { data, meta } = await patientService.list(req.validated.query);
  paginated(res, data, meta);
};
export const getOne: RequestHandler = async (req, res) =>
  ok(res, await patientService.getById(req.validated.params.id));
export const create: RequestHandler = async (req, res) =>
  ok(res, await patientService.create(req.validated.body), 201);
export const update: RequestHandler = async (req, res) =>
  ok(res, await patientService.update(req.validated.params.id, req.validated.body));
export const remove: RequestHandler = async (req, res) => {
  await patientService.remove(req.validated.params.id);
  noContent(res);
};
