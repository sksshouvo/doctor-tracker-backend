import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { loginLimiter } from '../../middlewares/rateLimiters.js';
import { validate } from '../../middlewares/validate.js';
import * as c from './auth.controller.js';
import { loginSchema } from './auth.schemas.js';

export const authRoutes = Router();

authRoutes.post('/login', loginLimiter, validate({ body: loginSchema }), c.login);
authRoutes.post('/refresh', c.refresh);
authRoutes.post('/logout', c.logout);
authRoutes.get('/me', requireAuth, c.me);
