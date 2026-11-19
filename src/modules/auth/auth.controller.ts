import type { RequestHandler } from 'express';
import { ok, noContent } from '../../lib/apiResponse.js';
import { authService } from './auth.service.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './tokens.js';

export const login: RequestHandler = async (req, res) => {
  const { email, password } = req.validated.body;
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  setAuthCookies(res, refreshToken);
  ok(res, { accessToken, user });
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await authService.refresh(
      req.cookies?.[REFRESH_COOKIE],
    );
    setAuthCookies(res, refreshToken);
    ok(res, { accessToken, user });
  } catch (e) {
    clearAuthCookies(res);
    throw e;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  noContent(res);
};

export const me: RequestHandler = async (req, res) => {
  ok(res, await authService.me(req.user!.id));
};
