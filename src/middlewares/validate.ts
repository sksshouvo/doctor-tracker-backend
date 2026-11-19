import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/**
 * Parses body/query/params with Zod. Express 5 makes `req.query` a getter, so parsed values are
 * stored on `req.validated` instead of reassigning request properties.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    req.validated = {};
    if (schemas.params) req.validated.params = schemas.params.parse(req.params);
    if (schemas.query) req.validated.query = schemas.query.parse(req.query);
    if (schemas.body) req.validated.body = schemas.body.parse(req.body ?? {});
    next();
  };
