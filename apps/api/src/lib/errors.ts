import { StatusCodes } from 'http-status-codes';
import type { ApiErrorCode } from '@shizuku/types';

/**
 * Domain error class. Thrown from services, caught by the global error handler,
 * serialized into the `{error: {code, message, details}}` envelope.
 *
 * The handler maps `statusCode` to the HTTP response code; `expose=true` is set
 * for safe-to-show errors. Anything thrown that ISN'T an HttpError becomes a
 * generic 500 with `code: 'internal'` and the real message hidden.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: unknown,
    expose = true,
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export const httpError = {
  badRequest: (code: ApiErrorCode, message: string, details?: unknown) =>
    new HttpError(StatusCodes.BAD_REQUEST, code, message, details),
  unauthorized: (code: ApiErrorCode, message = 'Unauthorized') =>
    new HttpError(StatusCodes.UNAUTHORIZED, code, message),
  forbidden: (code: ApiErrorCode = 'forbidden', message = 'Forbidden') =>
    new HttpError(StatusCodes.FORBIDDEN, code, message),
  notFound: (code: ApiErrorCode = 'not_found', message = 'Not found') =>
    new HttpError(StatusCodes.NOT_FOUND, code, message),
  conflict: (code: ApiErrorCode, message: string, details?: unknown) =>
    new HttpError(StatusCodes.CONFLICT, code, message, details),
  rateLimited: (code: ApiErrorCode, message: string, details?: unknown) =>
    new HttpError(StatusCodes.TOO_MANY_REQUESTS, code, message, details),
};
