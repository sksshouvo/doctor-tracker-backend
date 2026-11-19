import type { RequestHandler } from 'express';
import { ApiError } from '../lib/ApiError.js';

export const notFound: RequestHandler = (req) => {
  throw ApiError.notFound(`Route ${req.method} ${req.path} not found`);
};
