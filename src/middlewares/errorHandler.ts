import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { ApiError, type ErrorDetail } from '../lib/ApiError.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

function send(
  res: Parameters<ErrorRequestHandler>[2],
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
) {
  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}), requestId },
  });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const rid = req.id;

  if (err instanceof ApiError)
    return send(res, rid, err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return send(res, rid, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return send(res, rid, 400, 'VALIDATION_ERROR', 'Request validation failed', [
      { path: err.path, message: `Invalid ${err.kind}` },
    ]);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return send(res, rid, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  if (err?.code === 11000) {
    const path = Object.keys(err.keyPattern ?? { email: 1 })[0] ?? 'email';
    return send(res, rid, 409, 'DUPLICATE_EMAIL', `A record with this ${path} already exists`, [
      { path, message: 'Already exists' },
    ]);
  }

  if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
    return send(res, rid, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  if (err?.type === 'entity.parse.failed') {
    return send(res, rid, 400, 'VALIDATION_ERROR', 'Malformed JSON body');
  }
  if (err?.type === 'entity.too.large') {
    return send(res, rid, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  }

  logger.error({ err, requestId: rid }, 'Unhandled error');
  const message =
    env.NODE_ENV === 'production' ? 'Something went wrong' : String(err?.message ?? err);
  return send(res, rid, 500, 'INTERNAL_ERROR', message);
};
