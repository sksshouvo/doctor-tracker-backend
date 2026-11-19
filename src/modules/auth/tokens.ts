import { randomUUID } from 'node:crypto';
import type { Response, CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

type TokenUser = { id: string; role: string; tokenVersion: number };

export const REFRESH_COOKIE = 'dt_refresh';
export const SESSION_COOKIE = 'dt_session';
const MAX_AGE_MS = env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000;

export const signAccess = (u: TokenUser) =>
  jwt.sign({ sub: u.id, role: u.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });

/** `jti` makes every rotated token unique even when issued within the same second. */
export const signRefresh = (u: TokenUser) =>
  jwt.sign({ sub: u.id, tv: u.tokenVersion }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_EXPIRES_DAYS}d`,
    jwtid: randomUUID(),
  });

export const verifyRefresh = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload & { tv: number };

const clearOpts: CookieOptions = {
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};
const base: CookieOptions = { ...clearOpts, maxAge: MAX_AGE_MS };

export function setAuthCookies(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, httpOnly: true, path: '/api/v1/auth' });
  // Non-secret marker so the Next.js route guard can redirect before render.
  res.cookie(SESSION_COOKIE, '1', { ...base, httpOnly: false, path: '/' });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...clearOpts, httpOnly: true, path: '/api/v1/auth' });
  res.clearCookie(SESSION_COOKIE, { ...clearOpts, httpOnly: false, path: '/' });
}
