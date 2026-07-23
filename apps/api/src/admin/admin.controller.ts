import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@amragrir/shared';
import { CurrentUser, Roles } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { AdminService } from './admin.service';
import { MetricsService } from './metrics.service';
import {
  CreateRestaurantDto,
  IssuePromoDto,
  ListUsersDto,
  MetricsQueryDto,
  SetRoleDto,
} from './dto';

/**
 * Platform administration. `@Roles(Role.Admin)` on the class, so every route
 * added here is admin-only by default rather than by remembering.
 */
@Controller('admin')
@Roles(Role.Admin)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('metrics')
  overview(@Query() query: MetricsQueryDto) {
    return this.metrics.overview(query);
  }

  /** Payments and orders that disagree. Empty is the expected answer. */
  @Get('metrics/reconciliation')
  reconciliation() {
    return this.metrics.reconciliation();
  }

  @Get('users')
  listUsers(@Query() query: ListUsersDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/role')
  setRole(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.admin.setRole(actor, id, dto);
  }

  @Post('restaurants')
  createRestaurant(@Body() dto: CreateRestaurantDto) {
    return this.admin.createRestaurant(dto);
  }

  @Post('promos')
  issuePromo(@Body() dto: IssuePromoDto) {
    return this.admin.issuePromo(dto);
  }
}
