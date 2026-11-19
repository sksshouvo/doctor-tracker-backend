/* eslint-disable @typescript-eslint/no-explicit-any */
import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    user?: { id: string; role: 'admin' };
    validated: { body?: any; query?: any; params?: any };
  }
}
