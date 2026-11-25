import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ValidationFailedException } from '../../../../libs/common/errors/validation-failed.exception.js';

/** Message multer's "too many files" error carries once Nest has turned it into an HTTP exception. */
export const TOO_MANY_FILES_MESSAGE = 'Too many files';

/** Multer messages for a file in another field, or oversize/too many text parts (S1). */
const MALFORMED_UPLOAD_MESSAGES = ['Field value too long', 'Field name too long', 'Too many fields', 'Too many parts'];
const UNEXPECTED_FILE_MESSAGE = 'Unexpected field';

/**
 * Turns multer's file-count error into the plan's coded 422 `photos.tooMany` (FR-021, FR-023).
 * Register it before the multer interceptor so it wraps it. The size cap stays a 413 `upload.tooLarge`.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpException && err.message === TOO_MANY_FILES_MESSAGE) {
          return throwError(
            () =>
              new ValidationFailedException([
                { field: 'photos', code: 'photos.tooMany', message: 'You added too many photos.' },
              ]),
          );
        }
        if (err instanceof HttpException && err.message === UNEXPECTED_FILE_MESSAGE) {
          return throwError(
            () =>
              new ValidationFailedException([
                { field: 'photos', code: 'photos.unexpectedField', message: 'Files must be sent as photos.' },
              ]),
          );
        }
        if (err instanceof HttpException && MALFORMED_UPLOAD_MESSAGES.includes(err.message)) {
          return throwError(
            () =>
              new ValidationFailedException([
                { field: 'data', code: 'request.malformed', message: 'The request is malformed.' },
              ]),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
