import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IMAGE_UPLOAD_TYPE_LIST,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_MB,
} from '@amragrir/shared';
import {
  COVER_PHOTO_DIR,
  MENU_PHOTO_DIR,
  publicUrlFor,
  sniffImageType,
  storedNameFor,
} from './uploads';

/** What an upload answers with: the URL to store on the dish or the restaurant. */
export interface StoredUpload {
  url: string;
}

/**
 * Where an uploaded image goes, and what it comes back as.
 *
 * Local disk, served by the API itself (see the static mount in `main.ts`).
 * That is the honest shape of this today — a single instance with a volume —
 * and it is the reason the URL is *built* here rather than assembled by the
 * caller: moving to object storage changes this one method and nothing that
 * calls it, because a dish only ever stores the address it was handed.
 */
@Injectable()
export class UploadsService {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    // Resolved once, against the process's directory rather than per request:
    // a relative `UPLOAD_DIR` must not mean two places if anything ever changes
    // the working directory mid-run.
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? './uploads');
    this.baseUrl = config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3000';
  }

  /**
   * Stores one menu photo and returns its URL.
   *
   * Every refusal happens before anything touches the disk, and each says which
   * of the three things went wrong — an upload that fails identically for "too
   * big", "not an image" and "nothing arrived" is one somebody retries blind.
   */
  saveMenuPhoto(bytes: Buffer | undefined, tooLarge: boolean): Promise<StoredUpload> {
    return this.save(bytes, tooLarge, MENU_PHOTO_DIR);
  }

  /**
   * Stores one restaurant cover and returns its URL.
   *
   * The same bytes, the same refusals and the same limit as a dish — a cover is
   * drawn larger, but "larger" is a rendering decision and a second size limit
   * here would be a number to keep in step with a stylesheet. What differs is
   * the permission in front of it (`restaurant:write`, not `menu:write`) and
   * the directory underneath, and both of those are decided by the caller
   * rather than by the bytes.
   */
  saveRestaurantCover(bytes: Buffer | undefined, tooLarge: boolean): Promise<StoredUpload> {
    return this.save(bytes, tooLarge, COVER_PHOTO_DIR);
  }

  /** What both uploads actually do: refuse, then write under `dir`. Private
   *  because the directory is not the caller's to choose — an endpoint picks
   *  which kind of image it is accepting, and a string parameter reaching the
   *  controller would be a path this disk takes from a request. */
  private async save(
    bytes: Buffer | undefined,
    tooLarge: boolean,
    dir: string,
  ): Promise<StoredUpload> {
    if (tooLarge || (bytes?.length ?? 0) > MAX_IMAGE_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(`Photo is larger than ${MAX_IMAGE_UPLOAD_MB} MB`);
    }
    if (bytes === undefined || bytes.length === 0) {
      throw new BadRequestException('No photo in the request body');
    }

    const type = sniffImageType(bytes);
    if (type === null) {
      throw new UnsupportedMediaTypeException(
        `Photo must be one of: ${IMAGE_UPLOAD_TYPE_LIST.join(', ')}`,
      );
    }

    // A random name, not the one the file arrived with: an uploaded name is
    // attacker-controlled text that would otherwise become a path on this disk
    // and a URL on this origin, and two restaurants both uploading `photo.jpg`
    // would be one overwriting the other.
    const name = storedNameFor(type, randomUUID());
    const target = join(this.root, dir);

    await mkdir(target, { recursive: true });
    await writeFile(join(target, name), bytes);

    return { url: publicUrlFor(this.baseUrl, `${dir}/${name}`) };
  }
}
