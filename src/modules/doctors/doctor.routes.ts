import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { idParam } from '../../lib/pagination.js';
import {
  doctorPatientParams,
  patientCreateForDoctor,
  patientListQuery,
} from '../patients/patient.schemas.js';
import * as c from './doctor.controller.js';
import {
  doctorCreate,
  doctorListQuery,
  doctorOptionsQuery,
  doctorUpdate,
} from './doctor.schemas.js';

export const doctorRoutes = Router();
doctorRoutes.use(requireAuth, requireRole('admin'));

// Static routes must be declared before `/:id`.
doctorRoutes.get('/options', validate({ query: doctorOptionsQuery }), c.options);
doctorRoutes.get('/facets', c.facets);
doctorRoutes.get('/', validate({ query: doctorListQuery }), c.list);
doctorRoutes.post('/', validate({ body: doctorCreate }), c.create);
doctorRoutes.get('/:id', validate({ params: idParam }), c.getOne);
doctorRoutes.patch('/:id', validate({ params: idParam, body: doctorUpdate }), c.update);
doctorRoutes.delete('/:id', validate({ params: idParam }), c.remove);

doctorRoutes.get(
  '/:id/patients',
  validate({ params: idParam, query: patientListQuery }),
  c.listPatients,
);
doctorRoutes.post(
  '/:id/patients',
  validate({ params: idParam, body: patientCreateForDoctor }),
  c.createPatient,
);
doctorRoutes.delete(
  '/:id/patients/:patientId',
  validate({ params: doctorPatientParams }),
  c.removePatient,
);
