import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParam } from '../../lib/pagination.js';
import * as c from './patient.controller.js';
import { patientCreate, patientListQuery, patientUpdate } from './patient.schemas.js';

export const patientRoutes = Router();
patientRoutes.use(requireAuth, requireRole('admin'));

patientRoutes.get('/', validate({ query: patientListQuery }), c.list);
patientRoutes.post('/', validate({ body: patientCreate }), c.create);
patientRoutes.get('/:id', validate({ params: idParam }), c.getOne);
patientRoutes.patch('/:id', validate({ params: idParam, body: patientUpdate }), c.update);
patientRoutes.delete('/:id', validate({ params: idParam }), c.remove);
