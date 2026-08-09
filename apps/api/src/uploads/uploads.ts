import { IMAGE_UPLOAD_TYPES, type ImageUploadType } from '@amragrir/shared';

/**
 * What an uploaded image is allowed to be, and how the API decides.
 *
 * *What* is allowed lives in `@amragrir/shared` — the panel checks the same
 * limits before it sends, and two copies of "which types are images" is two
 * places for the answer to change. *How it is decided* is here, because only
 * the side holding the bytes can look at them.
 *
 * Pure functions, kept out of the service so the rules can be tested without a
 * Nest context or a disk — the interesting part of an upload is what it refuses.
 */

/** Where uploads are served from. One constant, read by both the static mount
 *  in `main.ts` and the URLs `UploadsService` hands back, so the address a
 *  photo is stored under is the address it can be fetched from. */
export const UPLOADS_URL_PREFIX = '/uploads';

/**
 * Where the images that ship with the repo are served from — `apps/api/public`.
 *
 * Separate from uploads because the two have opposite lifecycles: one is
 * version-controlled artwork that ships with a deploy, the other is a volume
 * somebody can empty. The seeded placeholder photos live here.
 */
export const STATIC_URL_PREFIX = '/static';

/** The subdirectory menu photos live in, under `UPLOAD_DIR`. */
export const MENU_PHOTO_DIR = 'menu';

/**
 * The subdirectory restaurant covers live in, under `UPLOAD_DIR`.
 *
 * Separate from the dishes rather than one flat pile: the two are uploaded
 * behind different permissions and are wanted at different sizes, so whoever
 * later adds thumbnailing or a sweep for orphans can act on one without
 * reasoning about the other. Names are uuids either way, so this is not
 * preventing a collision — it is keeping the two answerable apart.
 */
export const COVER_PHOTO_DIR = 'covers';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * What these bytes actually are, or null for anything else.
 *
 * The `Content-Type` the browser sent is not consulted, because it is a claim
 * rather than a fact: the extension chosen here decides the `Content-Type` the
 * file is later *served* with, so believing the header would let somebody store
 * a page of HTML as `photo.png` and have the API hand it back as HTML from its
 * own origin. Sniffing is what makes that impossible rather than unlikely.
 */
export function sniffImageType(bytes: Buffer): ImageUploadType | null {
  // SOI marker, then the start of the first segment. Covers JFIF, Exif and the
  // bare stream a phone produces, which differ only after these three bytes.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= PNG_MAGIC.length && bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'image/png';
  }
  // A RIFF container that says WEBP in its fourth word. The four bytes between
  // are the file length, which is why this reads two windows and not one.
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** The file name to store these bytes under: a fresh uuid, and the extension
 *  the sniffed type is served as. */
export function storedNameFor(type: ImageUploadType, id: string): string {
  return `${id}.${IMAGE_UPLOAD_TYPES[type]}`;
}

/** The public URL of a stored file, from the API's own base address. Trailing
 *  slashes on the configured base are dropped so `…/uploads//menu/x.jpg`
 *  cannot happen — some CDNs treat that as a different path. */
export function publicUrlFor(baseUrl: string, storedPath: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${UPLOADS_URL_PREFIX}/${storedPath}`;
}
