import { UnprocessableEntityException } from '@nestjs/common';

/** One failed rule. The app renders text from `code` + `params` (NFR-016); `message` is an English fallback. */
export interface ErrorDetail {
  field: string;
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

/** Deterministic rule failures: HTTP 422, nothing stored (FR-023, Q-E3). */
export class ValidationFailedException extends UnprocessableEntityException {
  constructor(readonly errors: ErrorDetail[]) {
    super({ statusCode: 422, code: 'validation.failed', message: 'Please fix the highlighted fields.', errors });
  }
}
