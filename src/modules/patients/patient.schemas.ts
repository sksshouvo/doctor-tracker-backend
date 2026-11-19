import { z } from 'zod';
import { env } from '../../config/env.js';
import {
  baseListQuery,
  csv,
  dateRangeMessage,
  nonEmpty,
  objectId,
  refineDateRange,
} from '../../lib/pagination.js';
import { endOfTodayUtc } from '../../lib/dates.js';
import { phoneSchema } from '../doctors/doctor.schemas.js';
import { BLOOD_GROUPS, CONDITIONS, GENDERS } from './patient.model.js';

const conditionEnum = z.enum(CONDITIONS);

/** Trims; '' means "not provided" so forms can submit empty optional fields. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const patientBase = z
  .object({
    name: z.string().trim().min(2).max(100),
    age: z.coerce.number().int().min(0).max(130),
    gender: z.enum(GENDERS),
    phone: phoneSchema,
    email: z
      .union([z.literal(''), z.string().trim().toLowerCase().email()])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    address: optionalText(250),
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    diagnosis: z.string().trim().min(2).max(200),
    condition: conditionEnum,
    visitDate: z.coerce
      .date()
      .refine((d) => d <= endOfTodayUtc(env.APP_TIMEZONE), 'Visit date cannot be in the future'),
    notes: optionalText(1000),
  })
  .strict();

export const patientCreate = patientBase.extend({ doctorId: objectId }).strict();
export const patientCreateForDoctor = patientBase;
export const patientUpdate = patientCreate.partial().refine(nonEmpty, 'No fields to update');

export const patientListQuery = baseListQuery
  .extend({
    condition: csv(conditionEnum).optional(),
    doctorId: objectId.optional(),
    gender: z.enum(GENDERS).optional(),
    dateField: z.enum(['visitDate', 'createdAt']).default('visitDate'),
    sort: z
      .enum(['visitDate', '-visitDate', 'createdAt', '-createdAt', 'name', '-name', 'age', '-age'])
      .default('-visitDate'),
  })
  .refine(refineDateRange, dateRangeMessage);

export const doctorPatientParams = z.object({ id: objectId, patientId: objectId });

export type PatientListQuery = z.infer<typeof patientListQuery>;
export type PatientCreate = z.infer<typeof patientCreate>;
export type PatientUpdate = z.infer<typeof patientUpdate>;
