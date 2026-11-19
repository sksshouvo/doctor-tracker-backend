import type { Response } from 'express';

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export const ok = <T>(res: Response, data: T, status = 200) =>
  res.status(status).json({ success: true, data });

export const paginated = <T>(res: Response, data: T[], meta: PageMeta) =>
  res.status(200).json({ success: true, data, meta });

export const noContent = (res: Response) => res.status(204).end();
