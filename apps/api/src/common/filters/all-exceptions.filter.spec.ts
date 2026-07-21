import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function capture() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/v1/auth/send-code' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it.each([
    [HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR'],
    [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
    [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [HttpStatus.CONFLICT, 'CONFLICT'],
    [HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE'],
    // Regression: 429 was missing from the map, so a rate-limited caller was
    // told INTERNAL_ERROR — indistinguishable from a server fault.
    [HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED'],
  ])('maps status %i to code %s', (status, code) => {
    const { host, json } = capture();

    new AllExceptionsFilter().catch(new HttpException('nope', status), host);

    expect(json).toHaveBeenCalledWith({ error: { code, message: 'nope' } });
  });

  // Regression: the filter rebuilt the body from `message` alone, silently
  // dropping context the client was documented to receive.
  it('forwards extra fields attached by the thrower, such as retryAfter', () => {
    const { host, json } = capture();
    const exception = new HttpException(
      { message: 'Please wait 60s before requesting another code', retryAfter: 60 },
      HttpStatus.TOO_MANY_REQUESTS,
    );

    new AllExceptionsFilter().catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMITED',
        message: 'Please wait 60s before requesting another code',
        details: { retryAfter: 60 },
      },
    });
  });

  it('collapses ValidationPipe messages into details.fields', () => {
    const { host, json } = capture();
    const exception = new HttpException(
      { message: ['phone must be a string', 'code must contain digits only'], statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );

    new AllExceptionsFilter().catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { fields: ['phone must be a string', 'code must contain digits only'] },
      },
    });
  });

  it('omits details when there is nothing extra to report', () => {
    const { host, json } = capture();
    const exception = new HttpException({ message: 'Invalid code', statusCode: 401 }, 401);

    new AllExceptionsFilter().catch(exception, host);

    expect(json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid code', details: undefined },
    });
  });

  // An unexpected error must never leak a stack trace or internal message.
  it('hides the detail of non-HTTP exceptions behind a 500', () => {
    const { host, status, json } = capture();

    new AllExceptionsFilter().catch(new Error('connection string: postgres://secret'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
