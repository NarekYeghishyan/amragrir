import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { CurrentUser, RequiresVerifiedPhone } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { FavoritesService } from './favorites.service';

export class AddFavoriteDto {
  @IsUUID()
  restaurantId!: string;
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
    return this.favorites.add(user.sub, dto.restaurantId);
  }

  @Delete(':restaurantId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.favorites.remove(user.sub, restaurantId);
  }
}
