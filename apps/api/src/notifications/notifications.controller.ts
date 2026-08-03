import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Permission } from '@amragrir/shared';
import { CurrentStaff, RequiresPermission, StaffRoute } from '../staff/decorators';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { StaffNotificationsService } from './staff-notifications.service';
import { ListNotificationsDto, MarkNotificationsReadDto } from './dto';

/**
 * The back office's bell.
 *
 * Gated on `orders:read` rather than a permission of its own: every
 * notification that exists is about an order, and anyone who can watch the
 * board it sits on can be told about it. Inventing `notifications:read` would
 * create a permission nobody could hold without also holding this one.
 *
 * The service scopes its queries by the same permission, because "may you call
 * this" and "which rows may you see" are different questions.
 */
@Controller('staff/notifications')
@StaffRoute()
export class NotificationsController {
  constructor(private readonly notifications: StaffNotificationsService) {}

  @Get()
  @RequiresPermission(Permission.OrdersRead)
  list(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListNotificationsDto) {
    return this.notifications.list(staff, query.limit);
  }

  /**
   * Marks notifications read **by this person**.
   *
   * A POST rather than a PATCH on each id: a bell is cleared by opening it, so
   * this arrives as one call with whatever was on screen.
   */
  @Post('read')
  @HttpCode(200)
  @RequiresPermission(Permission.OrdersRead)
  markRead(@CurrentStaff() staff: StaffJwtPayload, @Body() body: MarkNotificationsReadDto) {
    return this.notifications.markRead(staff, body.ids);
  }
}
