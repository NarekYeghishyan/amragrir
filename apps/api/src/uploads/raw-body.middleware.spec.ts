import { PassThrough } from 'node:stream';
import { collectRawBody, type RawBodyRequest } from './raw-body.middleware';

/** A request is a readable stream as far as this middleware is concerned. */
const requestOf = (): RawBodyRequest => new PassThrough() as unknown as RawBodyRequest;

const run = (
  chunks: Buffer[],
  limit: number,
): Promise<RawBodyRequest> =>
  new Promise((resolve, reject) => {
    const req = requestOf();
    collectRawBody(limit)(req, {} as never, (error?: unknown) =>
      error === undefined ? resolve(req) : reject(error as Error),
    );
    for (const chunk of chunks) {
      (req as unknown as PassThrough).write(chunk);
    }
    (req as unknown as PassThrough).end();
  });

describe('collectRawBody', () => {
  it('hands the handler the whole body, however it arrived in pieces', async () => {
    const req = await run([Buffer.from('abc'), Buffer.from('def')], 1024);

    expect(req.rawBody?.toString()).toBe('abcdef');
    expect(req.rawBodyTooLarge).toBe(false);
  });

  it('leaves the body undefined when nothing was sent', async () => {
    const req = await run([], 1024);

    expect(req.rawBody).toBeUndefined();
    expect(req.rawBodyTooLarge).toBe(false);
  });

  it('keeps nothing past the limit, and says which of the two happened', async () => {
    const req = await run([Buffer.alloc(8), Buffer.alloc(8)], 10);

    // Absent *and* flagged: the service reads the flag first, so "too big" and
    // "you sent nothing" cannot be answered with the same message.
    expect(req.rawBody).toBeUndefined();
    expect(req.rawBodyTooLarge).toBe(true);
  });

  it('accepts a body of exactly the limit', async () => {
    const req = await run([Buffer.alloc(10, 1)], 10);

    expect(req.rawBody).toHaveLength(10);
    expect(req.rawBodyTooLarge).toBe(false);
  });

  it('passes a broken connection on rather than handing over half a file', async () => {
    const req = requestOf();
    const failed = new Promise<unknown>((resolve) => {
      collectRawBody(1024)(req, {} as never, resolve);
    });

    (req as unknown as PassThrough).write(Buffer.from('half'));
    (req as unknown as PassThrough).destroy(new Error('connection reset'));

    await expect(failed).resolves.toEqual(new Error('connection reset'));
  });
});
