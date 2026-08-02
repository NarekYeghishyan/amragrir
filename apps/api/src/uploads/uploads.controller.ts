import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Permission } from '@amragrir/shared';
import { RequiresPermission, StaffRoute } from '../staff/decorators';
import type { RawBodyRequest } from './raw-body.middleware';
import { UploadsService, type StoredUpload } from './uploads.service';

/**
 * Uploading the images the back office refers to.
 *
 * Its own controller rather than a route on `/restaurant`, because what is
 * being created is a *file* and not a dish: the panel uploads first and creates
 * the menu item second, so a dish whose form was abandoned costs an orphaned
 * image rather than a half-made row. (Those orphans are the known cost of this
 * shape — nothing sweeps them yet; see docs/API_DOCUMENTATION.md.)
 */
@Controller('uploads')
@StaffRoute()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * `POST /v1/uploads/menu-photo` — the image bytes as the raw body, under
   * their own `Content-Type`.
   *
   * `menu:write`, the same permission that adds the dish this will hang on: an
   * account that cannot put a dish on the menu has no reason to be able to put
   * a file on this disk.
   */
  @Post('menu-photo')
  @RequiresPermission(Permission.MenuWrite)
  @HttpCode(HttpStatus.CREATED)
  menuPhoto(@Req() req: RawBodyRequest): Promise<StoredUpload> {
    return this.uploads.saveMenuPhoto(req.rawBody, req.rawBodyTooLarge === true);
  }
}
