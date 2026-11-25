import { jest } from '@jest/globals';
import { type ArgumentsHost, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiExceptionFilter } from './http-exception.filter.js';
import { ValidationFailedException } from './validation-failed.exception.js';

function run(err: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(err, host);
  return { status, body: json.mock.calls[0]?.[0] };
}

describe('ApiExceptionFilter', () => {
  it('answers 422 with coded field errors and params (FR-023)', () => {
    const errors = [
      { field: 'amount.value', code: 'amount.outOfRange', message: 'm', params: { min: 1, max: 50, unit: 'trees' } },
    ];
    const r = run(new ValidationFailedException(errors));
    expect(r.status).toHaveBeenCalledWith(422);
    expect(r.body).toEqual({ message: 'Please fix the highlighted fields.', code: 'validation.failed', errors });
  });
  it('keeps an explicit code on other HTTP errors', () => {
    const r = run(new NotFoundException({ code: 'activity.notFound', message: 'Activity not found' }));
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.body).toEqual({ statusCode: 404, code: 'activity.notFound', message: 'Activity not found' });
  });
  it('adds a default code for 400 and 401', () => {
    expect(run(new BadRequestException('x')).body).toMatchObject({ statusCode: 400, code: 'request.malformed' });
    expect(run(new UnauthorizedException()).body).toMatchObject({ statusCode: 401, code: 'auth.required' });
  });
  it('uses a generic code for unmapped statuses and string bodies', () => {
    class Teapot extends BadRequestException {
      override getStatus() {
        return 418;
      }
      override getResponse() {
        return 'teapot';
      }
    }
    expect(run(new Teapot()).body).toMatchObject({ statusCode: 418, code: 'error.http' });
  });
  it('hides details of unexpected errors', () => {
    const r = run(new Error('secret db string'));
    expect(r.status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(r.body)).not.toContain('secret');
    expect(run('weird').status).toHaveBeenCalledWith(500);
  });
});
