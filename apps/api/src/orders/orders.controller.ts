import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, RequiresVerifiedPhone } from '../auth/decorators';
import { resolveLanguage } from '../common/i18n';
import { Idempotent } from '../common/idempotency/idempotency.decorator';
import type { JwtPayload } from '../auth/token.service';
import { OrdersService } from './orders.service';
import { BasketDto, CreateOrderDto, ListOrdersDto } from './dto';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Prices a basket. Open to guests (any bearer token) — filling a basket is
   * allowed before verification, only ordering is not
   * (ROLES_AND_PERMISSIONS.md §1).
   */
  @Post('cart/quote')
  @HttpCode(200)
  quote(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BasketDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.orders.quote(dto, resolveLanguage(acceptLanguage), user.sub);
  }

  @Post('orders')
  @RequiresVerifiedPhone()
  @Idempotent('orders.create')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrderDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.orders.create(user.sub, dto, resolveLanguage(acceptLanguage));
  }

  @Get('orders')
  @RequiresVerifiedPhone()
  list(@CurrentUser() user: JwtPayload, @Query() query: ListOrdersDto) {
    return this.orders.list(user.sub, query);
  }

  @Get('orders/:id')
  @RequiresVerifiedPhone()
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(user.sub, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  @RequiresVerifiedPhone()
  cancel(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(user.sub, id);
  }
}
