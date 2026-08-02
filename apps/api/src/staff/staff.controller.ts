import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@amragrir/shared';
import { CurrentStaff, RequiresPermission, StaffRoute } from './decorators';
import type { StaffJwtPayload } from './staff-token.service';
import { StaffDirectoryService } from './staff-directory.service';
import { StaffActivityService } from './staff-activity.service';
import { ImpersonationService } from './impersonation.service';
import { InvitesService } from './invites.service';
import { CreateInviteDto, ListActivityDto, ListStaffDto } from './dto';

/**
 * Managing the people who work here.
 *
 * Not under `/admin`: a `restaurant_admin` hires for their own restaurant and
 * holds none of the platform permissions, so putting this on the admin
 * controller would have forced one of two wrong answers — give restaurant
 * admins the platform screens, or give the platform the only hiring rights.
 *
 * Every route is scoped by the caller's reach for the permission it names, so
 * a restaurant admin sees and manages their own people and nobody else's.
 */
@Controller('staff')
@StaffRoute()
export class StaffController {
  constructor(
    private readonly directory: StaffDirectoryService,
    private readonly activityService: StaffActivityService,
    private readonly invites: InvitesService,
    private readonly impersonation: ImpersonationService,
  ) {}

  /** Who works here, within the caller's reach. Paged and searchable. */
  @Get()
  @RequiresPermission(Permission.StaffRead)
  list(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListStaffDto) {
    return this.directory.list(staff, query);
  }

  /**
   * Invitations still open, so a resend is a decision rather than a guess.
   *
   * Takes the same query as the directory, and for the same reason: the search
   * on that screen is over *people*, and somebody invited last week is a person
   * you are looking for — they simply have not accepted yet.
   */
  @Get('invites')
  @RequiresPermission(Permission.StaffRead)
  listInvites(@CurrentStaff() staff: StaffJwtPayload, @Query() query: ListStaffDto) {
    return this.directory.listInvites(staff, query);
  }

  /**
   * Invites someone, or grants the role directly if they already work here.
   *
   * The caller may only grant within their own reach, and may never grant a
   * role wider than one they hold — both checked in the service.
   */
  @Post('invites')
  @RequiresPermission(Permission.StaffInvite)
  invite(@CurrentStaff() staff: StaffJwtPayload, @Body() dto: CreateInviteDto) {
    return this.directory.invite(staff, dto);
  }

  /** Withdraws an invitation that has not been accepted. */
  @Delete('invites/:id')
  @RequiresPermission(Permission.StaffInvite)
  @HttpCode(204)
  revokeInvite(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.directory.revokeInvite(staff, id);
  }

  /**
   * Takes a role away.
   *
   * Removing the assignment, not the account: the person may hold roles
   * elsewhere, and `audit_log` still has to be able to name them.
   */
  @Delete('assignments/:id')
  @RequiresPermission(Permission.StaffRevoke)
  @HttpCode(204)
  revoke(@CurrentStaff() staff: StaffJwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.directory.revokeAssignment(staff, id);
  }

  /**
   * What this person has done — menu edits, orders they moved, people they
   * invited — newest first.
   *
   * `staff:activity` rather than `staff:read`: knowing who works here and
   * knowing everything they did are different powers, and the endpoint that
   * grants the second should be able to be taken away without closing the
   * directory.
   *
   * Scoped twice: to a person the caller can already see, and then to the
   * entries inside the caller's own reach. Somebody who works for two
   * restaurants shows each admin only their own half.
   */
  @Get(':id/activity')
  @RequiresPermission(Permission.StaffActivity)
  activity(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListActivityDto,
  ) {
    return this.activityService.list(staff, id, query);
  }

  /**
   * Signs the caller in as this person — a `super_admin` only.
   *
   * Returns an access token and no refresh token: the session lasts one access
   * TTL and cannot be extended. There is no matching "stop" endpoint, and
   * deliberately so — the super admin's own tokens were never revoked, so
   * ending it is the panel putting them back, not a round trip.
   *
   * 200 rather than 201: nothing was created.
   */
  @Post(':id/impersonate')
  @RequiresPermission(Permission.StaffImpersonate)
  @HttpCode(200)
  impersonate(
    @CurrentStaff() staff: StaffJwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ) {
    return this.impersonation.begin(staff, id, request.ip);
  }
}
