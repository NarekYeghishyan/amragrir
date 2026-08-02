import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Error envelope shared by every endpoint, matching docs/API_DOCUMENTATION.md:
 *  { "error": { "code", "message", "details" } } */
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const STATUS_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = this.buildBody(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url}`, exception as Error);
    }

    response.status(status).json(body);
  }

  private buildBody(exception: unknown, status: number): ErrorBody {
    const code = STATUS_CODE[status] ?? 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { error: { code, message: res } };
      }
      const obj = res as Record<string, unknown>;
      // Nest's ValidationPipe puts the array of messages under `message`.
      const message = Array.isArray(obj.message)
        ? 'Validation failed'
        : String(obj.message ?? exception.message);

      // Anything a thrower attached beyond the standard envelope keys is
      // context the client needs (e.g. `retryAfter` on a 429) — forward it
      // rather than silently dropping it.
      const { message: _message, statusCode: _statusCode, error: _error, ...extra } = obj;
      const details = Array.isArray(obj.message)
        ? { fields: obj.message }
        : Object.keys(extra).length > 0
          ? extra
          : undefined;

      return { error: { code, message, details } };
    }

    return {
      error: {
        code,
        message: 'Internal server error',
      },
    };
  }
}
