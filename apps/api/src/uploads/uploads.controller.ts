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

  /**
   * `POST /v1/uploads/restaurant-cover` — the same shape as above, for the
   * photograph on a restaurant's card.
   *
   * `restaurant:write`, which a `restaurant_manager` does not hold: the cover
   * is one statement covering every branch of the business, so the permission
   * matches `PATCH /restaurant/restaurants/:id/services` rather than the menu.
   * Storing the file and putting it on the restaurant are two requests for the
   * same reason a dish's photo is — an abandoned form costs an orphaned image
   * instead of a half-changed row — so this grants no reach on its own: it
   * writes a file and hands back a URL, and the PATCH is where the caller's
   * scope decides *which* restaurant may be given it.
   */
  @Post('restaurant-cover')
  @RequiresPermission(Permission.RestaurantWrite)
  @HttpCode(HttpStatus.CREATED)
  restaurantCover(@Req() req: RawBodyRequest): Promise<StoredUpload> {
    return this.uploads.saveRestaurantCover(req.rawBody, req.rawBodyTooLarge === true);
  }

  /**
   * `POST /v1/uploads/branch-cover` — the same bytes, for one branch's own
   * photograph.
   *
   * `branch:write`, so a `restaurant_manager` may upload one. Its own route
   * rather than a parameter on the one above, because the *permission* is the
   * whole difference: a manager may photograph their branch and may not
   * re-photograph the business, and a single endpoint would have to decide that
   * in a service, out of sight of the guard.
   *
   * The file lands in the same `covers/` directory — where the bytes go is not
   * what distinguishes them, and which restaurant or branch may wear the result
   * is decided by the PATCH that stores the URL.
   */
  @Post('branch-cover')
  @RequiresPermission(Permission.BranchWrite)
  @HttpCode(HttpStatus.CREATED)
  branchCover(@Req() req: RawBodyRequest): Promise<StoredUpload> {
    return this.uploads.saveRestaurantCover(req.rawBody, req.rawBodyTooLarge === true);
  }
}
