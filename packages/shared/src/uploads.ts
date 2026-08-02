/**
 * What may be uploaded, shared by the side that enforces it and the side that
 * has to explain it before trying.
 *
 * The API is the one that decides — it sniffs the bytes and refuses anything
 * else — but the back office should not make somebody wait for a round trip to
 * be told their 40 MB screenshot is too big. Both read these, so the two answers
 * cannot drift into disagreeing about what an image is.
 */

/**
 * Accepted image types, each mapped to the extension it is stored under.
 *
 * Every phone camera and design tool produces one of these. The obvious
 * additions are each a problem: `image/svg+xml` is a document with scripts in
 * it, served back from the API's own origin, and `image/gif` invites a menu of
 * animated dishes.
 */
export const IMAGE_UPLOAD_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type ImageUploadType = keyof typeof IMAGE_UPLOAD_TYPES;

/** For an `accept` attribute, and for the message that names what went wrong. */
export const IMAGE_UPLOAD_TYPE_LIST = Object.keys(IMAGE_UPLOAD_TYPES) as ImageUploadType[];

/**
 * 5 MB.
 *
 * A photo of a plate taken on any phone lands well under this; the ceiling is
 * here so a mistaken drag of a raw camera file is refused in one round trip
 * rather than filling a disk.
 */
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

/** The same figure in whole megabytes, for a message somebody reads. */
export const MAX_IMAGE_UPLOAD_MB = MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024;
