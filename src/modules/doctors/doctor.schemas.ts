import { z } from 'zod';
import {
  baseListQuery,
  csv,
  dateRangeMessage,
  nonEmpty,
  refineDateRange,
} from '../../lib/pagination.js';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[0-9\s\-()]{7,20}$/, 'Invalid phone');

export const doctorCreate = z
  .object({
    name: z.string().trim().min(2).max(100),
    specialization: z.string().trim().min(2).max(80),
    hospital: z.string().trim().min(2).max(120),
    phone: phoneSchema,
    email: z.string().trim().toLowerCase().email(),
  })
  .strict();

export const doctorUpdate = doctorCreate.partial().refine(nonEmpty, 'No fields to update');

export const doctorListQuery = baseListQuery
  .extend({
    specialization: csv(z.string().trim().min(1)).optional(),
    hospital: csv(z.string().trim().min(1)).optional(),
    sort: z
      .enum(['createdAt', '-createdAt', 'name', '-name', 'patientCount', '-patientCount'])
      .default('-createdAt'),
  })
  .refine(refineDateRange, dateRangeMessage);

export const doctorOptionsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type DoctorListQuery = z.infer<typeof doctorListQuery>;
export type DoctorCreate = z.infer<typeof doctorCreate>;
export type DoctorUpdate = z.infer<typeof doctorUpdate>;
