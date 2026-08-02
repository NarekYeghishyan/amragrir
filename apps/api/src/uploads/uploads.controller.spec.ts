import type { AddressInfo } from 'node:net';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { MAX_IMAGE_UPLOAD_BYTES } from '@amragrir/shared';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { UploadsModule } from './uploads.module';

/**
 * The upload, over a real socket.
 *
 * `UploadsService` is unit-tested and the middleware with it; what neither can
 * see is whether the bytes ever reach them. Nest installs its own body parsers
 * before any module middleware, and an upload sent as a raw body depends on
 * those parsers *ignoring* it — a fact about wiring that is invisible to a
 * type check and to every test that calls a method directly.
 *
 * So this one starts the app, opens a port and posts real bytes at it. Guards
 * are out of scope here: they live on `AppModule` and are covered where they
 * are declared. This is about the plumbing.
 */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]);

describe('POST /uploads/menu-photo', () => {
  let app: INestApplication;
  let url: string;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'amragrir-upload-http-'));

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ UPLOAD_DIR: root, API_PUBLIC_URL: 'http://api.test' })],
        }),
        UploadsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // The same filter `main.ts` installs, so the error envelope below is the
    // one a client really receives — including the two status codes this
    // endpoint was the first to use.
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0);

    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://127.0.0.1:${port}/uploads/menu-photo`;
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (body: Buffer | string, contentType: string): Promise<Response> =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': contentType }, body });

  it('stores the body and answers 201 with the URL', async () => {
    const response = await post(JPEG, 'image/jpeg');

    expect(response.status).toBe(201);
    const stored = (await response.json()) as { url: string };
    expect(stored.url).toMatch(/^http:\/\/api\.test\/uploads\/menu\/[0-9a-f-]{36}\.jpg$/);
    await expect(readdir(join(root, 'menu'))).resolves.toContain(
      stored.url.split('/').pop() as string,
    );
  });

  it('answers 415 in the standard envelope for something that is not an image', async () => {
    const response = await post(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png');

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: expect.stringContaining('image/jpeg') },
    });
  });

  it('answers 413 for a photo past the limit, rather than dropping the connection', async () => {
    const tooBig = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES, 7)]);

    const response = await post(tooBig, 'image/jpeg');

    expect(response.status).toBe(413);
    expect((await response.json()) as unknown).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.stringContaining('5 MB') },
    });
  });

  it('answers 400 when the request carries no body at all', async () => {
    const response = await post('', 'image/jpeg');

    expect(response.status).toBe(400);
  });
});
