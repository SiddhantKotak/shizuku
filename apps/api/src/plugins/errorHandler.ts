import fp from 'fastify-plugin';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Global error handler. Converts thrown errors into the canonical
 * {error: {code, message, details?}} envelope. Never leaks internal Error
 * messages to the client.
 */
export default fp(async (app: FastifyInstance) => {
  app.setErrorHandler(handleError);
  app.setNotFoundHandler((_req, reply) => {
    reply
      .code(StatusCodes.NOT_FOUND)
      .send({ error: { code: 'not_found', message: 'Route not found' } });
  });
});

function handleError(
  err: FastifyError | HttpError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
): void {
  if (err instanceof HttpError) {
    if (err.statusCode >= StatusCodes.INTERNAL_SERVER_ERROR)
      req.log.error({ err }, 'http_error_5xx');
    else req.log.warn({ err: err.message, code: err.code }, 'http_error');
    reply.code(err.statusCode).send({
      error: {
        code: err.code,
        message: err.expose ? err.message : 'An error occurred',
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    req.log.warn({ issues: err.issues }, 'validation_error');
    reply.code(StatusCodes.BAD_REQUEST).send({
      error: {
        code: 'validation_error',
        message: 'Invalid request',
        details: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      },
    });
    return;
  }

  // Fastify-thrown 4xx (e.g. multipart payload too large, JSON parse error)
  const fastifyErr = err as FastifyError;
  if (
    fastifyErr.statusCode &&
    fastifyErr.statusCode >= StatusCodes.BAD_REQUEST &&
    fastifyErr.statusCode < StatusCodes.INTERNAL_SERVER_ERROR
  ) {
    req.log.warn({ err: err.message }, 'fastify_4xx');
    reply.code(fastifyErr.statusCode).send({
      error: {
        code: fastifyErr.code ?? 'bad_request',
        message: err.message,
      },
    });
    return;
  }

  // Anything else is a 500 — log full, hide details from client
  req.log.error({ err }, 'unhandled_error');
  reply.code(StatusCodes.INTERNAL_SERVER_ERROR).send({
    error: {
      code: 'internal',
      message: 'Internal server error',
    },
  });
}
