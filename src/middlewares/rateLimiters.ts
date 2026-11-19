import type { Request, Response } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { env } from '../config/env.js';

const rateLimited = (message: string) => (req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message, requestId: req.id },
  });
};

const enabled = env.NODE_ENV !== 'test';

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !enabled,
  handler: rateLimited('Too many requests, slow down'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !enabled,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').toLowerCase()}`,
  handler: rateLimited('Too many attempts, try again later'),
});
