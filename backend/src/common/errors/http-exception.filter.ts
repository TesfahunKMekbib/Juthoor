import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ValidationFailedException } from './validation-failed.exception.js';

interface ReplyLike {
  status(code: number): { json(body: unknown): unknown };
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'request.malformed',
  401: 'auth.required',
  404: 'resource.notFound',
  413: 'upload.tooLarge',
};

/** Turns every error into the plan's JSON shape; never leaks stack traces (NFR-033, NFR-016). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();

    if (exception instanceof ValidationFailedException) {
      reply.status(422).json({
        message: 'Please fix the highlighted fields.',
        code: 'validation.failed',
        errors: exception.errors,
      });
      return;
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const code = typeof obj.code === 'string' ? obj.code : (DEFAULT_CODES[statusCode] ?? 'error.http');
      const message = typeof obj.message === 'string' ? obj.message : exception.message;
      reply.status(statusCode).json({ statusCode, code, message });
      return;
    }
    // Log only the error type: messages may contain personal data (security rules).
    this.logger.error(`Unhandled error: ${exception instanceof Error ? exception.name : typeof exception}`);
    reply.status(500).json({ statusCode: 500, code: 'server.error', message: 'Something went wrong' });
  }
}
