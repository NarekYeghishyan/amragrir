import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Role } from '@amragrir/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { OwnerService } from './owner.service';
import { ListOwnerOrdersDto, SetOrderStatusDto } from './dto';

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
  constructor(private readonly owner: OwnerService) {}

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
}
