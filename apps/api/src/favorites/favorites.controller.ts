import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequiresVerifiedPhone } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { resolveLanguage } from '../common/i18n';
import { FavoritesService } from './favorites.service';

export class AddFavoriteDto {
  /** The branch, since that is what a favourite is (DATABASE.md §13) — a card
   *  on the feed, a page with a menu, an address somebody can order from. */
  @IsUUID()
  branchId!: string;
}

export class AddFavoriteDishDto {
  /** The dish. It names its own branch through `menu_items.branch_id`, so
   *  nothing here has to say which kitchen — and nothing here *may*, or two
   *  clients could disagree about where a dish is cooked. */
  @IsUUID()
  menuItemId!: string;
}

export class FavoriteDishIdsDto {
  /** Narrows the answer to one branch's menu — what a restaurant page asks,
   *  since it draws that branch's dishes and no others. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Favourites belong to an account, so they need a verified phone — a guest
 *  session is per-device and would lose them (ROLES_AND_PERMISSIONS.md §1). */
@Controller('favorites')
@RequiresVerifiedPhone()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.favorites.list(user.sub);
  }

  @Post()
  @HttpCode(200)
  add(@CurrentUser() user: JwtPayload, @Body() dto: AddFavoriteDto) {
    return this.favorites.add(user.sub, dto.branchId);
  }

  /**
   * Saved dishes — their own list, not a flag on the one above.
   *
   * A branch and a dish are different cards with different actions, and the
   * Favourites screen shows them under two tabs; merging them into one response
   * would make every client sort them apart again.
   *
   * Declared before `DELETE :branchId` has any say in it — these are two path
   * segments and that one is a single uuid, so nothing here shadows anything.
   */
  @Get('dishes')
  listDishes(@CurrentUser() user: JwtPayload, @Headers('accept-language') acceptLanguage?: string) {
    return this.favorites.listDishes(user.sub, resolveLanguage(acceptLanguage));
  }

  /** Which of this account's saved dishes to fill a heart for — ids only,
   *  because a menu already has the dishes and needs one bit about each. */
  @Get('dishes/ids')
  async dishIds(@CurrentUser() user: JwtPayload, @Query() query: FavoriteDishIdsDto) {
    return { ids: await this.favorites.dishIdsFor(user.sub, query.branchId) };
  }

  @Post('dishes')
  @HttpCode(200)
  addDish(@CurrentUser() user: JwtPayload, @Body() dto: AddFavoriteDishDto) {
    return this.favorites.addDish(user.sub, dto.menuItemId);
  }

  @Delete('dishes/:menuItemId')
  @HttpCode(204)
  removeDish(
    @CurrentUser() user: JwtPayload,
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
  ) {
    return this.favorites.removeDish(user.sub, menuItemId);
  }

  @Delete(':branchId')
  @HttpCode(204)
  remove(@CurrentUser() user: JwtPayload, @Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.favorites.remove(user.sub, branchId);
  }
}
