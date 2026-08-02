import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_UPLOAD_BYTES } from '@amragrir/shared';
import { photoRefusal } from './photo';

describe('photoRefusal', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('sends a %s', (type) => {
    expect(photoRefusal({ type, size: 1024 })).toBeNull();
  });

  it.each([
    ['a PDF somebody meant to attach elsewhere', 'application/pdf'],
    ['an SVG, which the API refuses too', 'image/svg+xml'],
    ['an animated GIF', 'image/gif'],
    ['a file the browser could not identify', ''],
  ])('refuses %s', (_label, type) => {
    expect(photoRefusal({ type, size: 1024 })).toBe('dishPhotoWrongType');
  });

  it('refuses a photo over the limit', () => {
    expect(photoRefusal({ type: 'image/jpeg', size: MAX_IMAGE_UPLOAD_BYTES + 1 })).toBe(
      'dishPhotoTooLarge',
    );
  });

  it('accepts one of exactly the limit — the ceiling is inclusive on both sides', () => {
    // The API's check is `> MAX`, so a file of exactly the limit uploads. A
    // panel that refused it here would be stricter than the rule it explains.
    expect(photoRefusal({ type: 'image/png', size: MAX_IMAGE_UPLOAD_BYTES })).toBeNull();
  });

  it('names the type before the size when a file is wrong in both ways', () => {
    // The type is the fixable one — "that is a PDF" sends somebody looking for
    // the right file, where "too large" sends them to compress the wrong one.
    expect(photoRefusal({ type: 'application/pdf', size: MAX_IMAGE_UPLOAD_BYTES * 3 })).toBe(
      'dishPhotoWrongType',
    );
  });
});
