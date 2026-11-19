import { z } from 'zod';
import type { PageMeta } from './apiResponse.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParam = z.object({ id: objectId });

/** Comma-separated query value -> array validated item by item (max 20). */
export const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    z.array(item).max(20),
  );

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const baseListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((n) => [10, 20, 50, 100].includes(n), 'limit must be one of 10, 20, 50, 100')
    .default(10),
  q: z.string().trim().max(100).optional(),
  from: day.optional(),
  to: day.optional(),
});

export const refineDateRange = <T extends { from?: string; to?: string }>(o: T) =>
  !o.from || !o.to || o.to >= o.from;
export const dateRangeMessage = { message: '`to` must be on or after `from`', path: ['to'] };

export const nonEmpty = (o: object) => Object.keys(o).length > 0;

/** `-createdAt` -> { createdAt: -1, _id: -1 } (stable tiebreak) */
export function toSort(sort: string): Record<string, 1 | -1> {
  const dir = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');
  return field === '_id' ? { _id: dir } : { [field]: dir, _id: dir };
}

export function buildMeta(page: number, limit: number, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
