import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { MAX_IMAGE_UPLOAD_BYTES } from '@amragrir/shared';
import type { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service';
import { publicUrlFor, sniffImageType } from './uploads';

/** The first bytes of each format, which is all the sniffer reads. Padded to a
 *  plausible length so a test cannot pass on a one-byte file. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x40, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
  Buffer.alloc(48, 7),
]);

const build = async (): Promise<{ service: UploadsService; root: string }> => {
  const root = await mkdtemp(join(tmpdir(), 'amragrir-uploads-'));
  const config = {
    get: (key: string) =>
      key === 'UPLOAD_DIR' ? root : key === 'API_PUBLIC_URL' ? 'https://api.amragrir.am' : undefined,
  } as unknown as ConfigService;

  return { service: new UploadsService(config), root };
};

describe('sniffImageType', () => {
  it.each([
    ['jpeg', JPEG, 'image/jpeg'],
    ['png', PNG, 'image/png'],
    ['webp', WEBP, 'image/webp'],
  ])('recognises %s', (_label, bytes, expected) => {
    expect(sniffImageType(bytes)).toBe(expected);
  });

  it.each([
    ['a script somebody renamed', Buffer.from('<script>alert(1)</script>', 'utf8')],
    // The one that matters most: an SVG is a document, and served from this
    // origin it would run against a signed-in panel.
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')],
    ['a GIF', Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(32)])],
    ['a RIFF container that is not WebP', Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x40, 0x00, 0x00, 0x00]),
      Buffer.from('WAVEfmt ', 'ascii'),
    ])],
    ['nothing', Buffer.alloc(0)],
  ])('refuses %s', (_label, bytes) => {
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe('publicUrlFor', () => {
  it('builds an absolute URL under the uploads prefix', () => {
    expect(publicUrlFor('https://api.amragrir.am', 'menu/a.jpg')).toBe(
      'https://api.amragrir.am/uploads/menu/a.jpg',
    );
  });

  it('does not double the slash when the base is configured with one', () => {
    expect(publicUrlFor('https://api.amragrir.am/', 'menu/a.jpg')).toBe(
      'https://api.amragrir.am/uploads/menu/a.jpg',
    );
  });
});

describe('UploadsService.saveMenuPhoto', () => {
  it('stores the bytes and answers with the URL they are served from', async () => {
    const { service, root } = await build();

    const { url } = await service.saveMenuPhoto(JPEG, false);

    expect(url).toMatch(/^https:\/\/api\.amragrir\.am\/uploads\/menu\/[0-9a-f-]{36}\.jpg$/);
    const name = url.split('/').pop() as string;
    await expect(readFile(join(root, 'menu', name))).resolves.toEqual(JPEG);
  });

  it('names the file for what the bytes are, not what they were called', async () => {
    const { service } = await build();

    const png = await service.saveMenuPhoto(PNG, false);
    const webp = await service.saveMenuPhoto(WEBP, false);

    expect(png.url.endsWith('.png')).toBe(true);
    expect(webp.url.endsWith('.webp')).toBe(true);
  });

  it('gives two uploads two names, so neither overwrites the other', async () => {
    const { service, root } = await build();

    const first = await service.saveMenuPhoto(JPEG, false);
    const second = await service.saveMenuPhoto(JPEG, false);

    expect(first.url).not.toBe(second.url);
    await expect(readdir(join(root, 'menu'))).resolves.toHaveLength(2);
  });

  it('refuses anything that is not one of the three formats', async () => {
    const { service, root } = await build();

    await expect(
      service.saveMenuPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), false),
    ).rejects.toThrow(UnsupportedMediaTypeException);
    // Nothing reached the disk — the directory was never even created.
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('refuses an empty body', async () => {
    const { service } = await build();

    await expect(service.saveMenuPhoto(undefined, false)).rejects.toThrow(BadRequestException);
    await expect(service.saveMenuPhoto(Buffer.alloc(0), false)).rejects.toThrow(BadRequestException);
  });

  it.each([
    // What the middleware reports when it stopped keeping bytes...
    ['the middleware gave up on it', undefined, true],
    // ...and the belt to that braces: bytes that arrived under the drain limit
    // but over the one a photo is allowed to be.
    ['it is over the limit anyway', Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1, 0xff), false],
  ])('refuses a photo that is too large — %s', async (_label, bytes, tooLarge) => {
    const { service } = await build();

    await expect(service.saveMenuPhoto(bytes, tooLarge)).rejects.toThrow(PayloadTooLargeException);
  });
});
