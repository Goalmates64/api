import { Request } from 'express';

export type AuthenticatedUserPayload = {
  userId?: number | string;
  sub?: number | string;
  email?: string;
};

export type RequestWithUser = Request & {
  user?: AuthenticatedUserPayload;
};
