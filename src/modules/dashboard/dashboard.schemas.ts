import { z } from 'zod';
import { env } from '../../config/env.js';
import { isValidTimezone } from '../../lib/dates.js';

const tz = z.string().default(env.APP_TIMEZONE).refine(isValidTimezone, 'Invalid IANA timezone');
const range = z.enum(['7d', '30d', '90d', '12m']).default('30d');

export const summaryQuery = z.object({ range, tz });
export const overTimeQuery = z.object({ range, tz });
export const perDoctorQuery = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
export const specializationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(8),
});
export const recentQuery = z.object({ limit: z.coerce.number().int().min(1).max(25).default(5) });
export const anyTzQuery = z.object({ tz });
