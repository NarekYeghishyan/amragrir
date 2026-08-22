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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@amragrir/shared';
import { CurrentStaff, RequiresPermission, StaffRoute } from '../staff/decorators';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { AdminService } from './admin.service';
import { CategoriesAdminService } from './categories.service';
import { MetricsService } from './metrics.service';
import {
  CreateCategoryDto,
  CreateRestaurantDto,
  IssuePromoDto,
  ListCustomerOrdersDto,
  ListUsersDto,
  MetricsQueryDto,
  UpdateCategoryDto,
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
    private readonly categories: CategoriesAdminService,
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

  /**
   * The platform's category vocabulary — the chips the whole catalogue is
   * browsed by.
   *
   * `categories:write` on all four, including the read: this is the editor's
   * list, retired rows and usage counts and all, and it is the only screen that
   * can put a retired category back. Guests and every other panel screen read
   * the public `GET /categories`, which shows the live rail in one language.
   *
   * The permission is held by `super_admin` alone. Not tightness for its own
   * sake — one person here changes how every restaurant on the platform is
   * indexed, and a duplicate spelling added in good faith splits a chip's
   * traffic with nothing in the product to report it.
   */
  @Get('categories')
  @RequiresPermission(Permission.CategoriesWrite)
  listCategories() {
    return this.categories.list();
  }

  @Post('categories')
  @RequiresPermission(Permission.CategoriesWrite)
  createCategory(@CurrentStaff() staff: StaffJwtPayload, @Body() dto: CreateCategoryDto) {
    return this.categories.create(staff, dto);
  }

  @Patch('categories/:id')
  @RequiresPermission(Permission.CategoriesWrite)
  updateCategory(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(staff, id, dto);
  }

  /** Only while nothing points at it; otherwise `PATCH … { isActive: false }`
   *  is the answer, and the refusal says so with the counts. */
  @Delete('categories/:id')
  @RequiresPermission(Permission.CategoriesWrite)
  @HttpCode(204)
  deleteCategory(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.categories.remove(staff, id);
  }
}
