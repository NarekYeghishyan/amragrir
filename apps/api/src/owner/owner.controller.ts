import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@amragrir/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { OwnerService } from './owner.service';
import { MenuService } from './menu.service';
import { ListOwnerOrdersDto, SetOrderStatusDto } from './dto';
import {
  CreateMenuItemDto,
  ListMenuItemsDto,
  UpdateBranchDto,
  UpdateMenuItemDto,
} from './menu.dto';

/**
 * Restaurant side of an order.
 *
 * `staff` is not listed: the schema has no user-to-branch link, so there is
 * nothing to scope them by, and giving them the owner's reach in the meantime
 * would be worse than making them wait (ROLES_AND_PERMISSIONS.md).
 */
@Controller('owner')
@Roles(Role.Owner, Role.Admin)
export class OwnerController {
  constructor(
    private readonly owner: OwnerService,
    private readonly menu: MenuService,
  ) {}

  @Get('orders')
  listOrders(@CurrentUser() user: JwtPayload, @Query() query: ListOwnerOrdersDto) {
    return this.owner.listOrders(user, query);
  }

  @Patch('orders/:id/status')
  setStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderStatusDto,
  ) {
    return this.owner.setStatus(user, id, dto);
  }

  @Get('branches')
  listBranches(@CurrentUser() user: JwtPayload) {
    return this.menu.listBranches(user);
  }

  @Patch('branches/:id')
  updateBranch(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.menu.updateBranch(user, id, dto);
  }

  /** Returns the raw `*_i18n` objects — the owner edits every language, so
   *  resolving one would hide the others. */
  @Get('menu-items')
  listMenu(@CurrentUser() user: JwtPayload, @Query() query: ListMenuItemsDto) {
    return this.menu.listMenu(user, query);
  }

  @Post('menu-items')
  createMenuItem(@CurrentUser() user: JwtPayload, @Body() dto: CreateMenuItemDto) {
    return this.menu.create(user, dto);
  }

  @Patch('menu-items/:id')
  updateMenuItem(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.update(user, id, dto);
  }

  @Delete('menu-items/:id')
  @HttpCode(204)
  removeMenuItem(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.remove(user, id);
  }
}
