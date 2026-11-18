import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * One error shape for the whole API, with a request id attached.
 *
 * Nest's default handler is fine in development but leaves production callers
 * with no way to quote a failing request, and logs an unhandled exception
 * without the URL that caused it. Here every response carries `x-request-id`
 * (and mirrors it in the body), 5xx errors are logged with the stack, and
 * internal exception text never reaches the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId =
      (res.getHeader('x-request-id') as string | undefined) ||
      (req.headers['x-request-id'] as string | undefined) ||
      randomUUID();
    res.setHeader('x-request-id', requestId);

    let body: Record<string, unknown>;
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      body =
        typeof response === 'string'
          ? { message: response }
          : { ...(response as Record<string, unknown>) };
    } else {
      body = { message: 'Internal server error' };
    }
    body.statusCode = status;
    body.requestId = requestId;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (res.headersSent) return;
    res.status(status).json(body);
  }
}
