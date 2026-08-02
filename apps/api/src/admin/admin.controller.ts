import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@amragrir/shared';
import { CurrentStaff, RequiresPermission, StaffRoute } from '../staff/decorators';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { AdminService } from './admin.service';
import { MetricsService } from './metrics.service';
import {
  CreateRestaurantDto,
  IssuePromoDto,
  ListCustomerOrdersDto,
  ListUsersDto,
  MetricsQueryDto,
} from './dto';

/**
 * Platform administration.
 *
 * Each route names the permission it needs. Only `super_admin` and
 * `platform_admin` hold these, so in practice this is the platform team's
 * controller — but it says so in terms of what is being done rather than who is
 * doing it, which is what let `restaurant_admin` keep its own staff management
 * without inheriting any of this.
 *
 * `PATCH /admin/users/{id}/role` is gone. Promoting a customer into staff is no
 * longer possible in either direction: staff are separate accounts, created
 * only by invitation (`POST /staff/invites`).
 */
@Controller('admin')
@StaffRoute()
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('metrics')
  @RequiresPermission(Permission.PlatformMetrics)
  overview(@Query() query: MetricsQueryDto) {
    return this.metrics.overview(query);
  }

  /** Payments and orders that disagree. Empty is the expected answer. */
  @Get('metrics/reconciliation')
  @RequiresPermission(Permission.PlatformMetrics)
  reconciliation() {
    return this.metrics.reconciliation();
  }

  /** The **customer** list. Staff accounts live in `GET /staff`. */
  @Get('users')
  @RequiresPermission(Permission.PlatformUsers)
  listUsers(@Query() query: ListUsersDto) {
    return this.admin.listUsers(query);
  }

  /**
   * One customer's phone number, unmasked.
   *
   * Its own route because it is its own act: the list masks every number, and
   * this is the deliberate, one-at-a-time exception a support call needs. It
   * writes `audit_log` before it answers — see `AdminService.revealPhone`.
   *
   * A GET that records is not a GET that changes anything: the entry is about
   * the reader, not about the account being read.
   */
  @Get('users/:id/phone')
  @RequiresPermission(Permission.PlatformUsers)
  revealPhone(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.admin.revealPhone(staff, id, request.ip);
  }

  /**
   * What this customer has ordered, newest first.
   *
   * `platform:users`, not `orders:read`: the board answers "what is this kitchen
   * working on" within a shift's reach, and this crosses every restaurant on the
   * platform to answer "what has this person bought".
   */
  @Get('users/:id/orders')
  @RequiresPermission(Permission.PlatformUsers)
  listCustomerOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCustomerOrdersDto,
  ) {
    return this.admin.listCustomerOrders(id, query);
  }

  @Post('restaurants')
  @RequiresPermission(Permission.RestaurantCreate)
  createRestaurant(@CurrentStaff() staff: StaffJwtPayload, @Body() dto: CreateRestaurantDto) {
    return this.admin.createRestaurant(staff, dto);
  }

  @Post('promos')
  @RequiresPermission(Permission.PromoIssue)
  issuePromo(@Body() dto: IssuePromoDto) {
    return this.admin.issuePromo(dto);
  }
}
