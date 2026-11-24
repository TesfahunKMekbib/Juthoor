import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { ValidationFailedException } from '../../common/errors/validation-failed.exception.js';

/** Message multer's "too many files" error carries once Nest has turned it into an HTTP exception. */
export const TOO_MANY_FILES_MESSAGE = 'Too many files';

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
        return throwError(() => err);
      }),
    );
  }
}
