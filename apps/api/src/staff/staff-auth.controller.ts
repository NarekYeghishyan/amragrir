import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { CurrentStaff, StaffRoute } from './decorators';
import type { StaffJwtPayload } from './staff-token.service';
import { StaffAuthService } from './staff-auth.service';
import {
  AcceptInviteDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  StaffLoginDto,
  StaffRefreshDto,
} from './dto';

/**
 * Back-office sign-in. Email and password — staff do not use the phone OTP
 * flow, and a customer account cannot reach any of this.
 *
 * The whole controller is @StaffRoute(), so the global customer guard stands
 * down; the routes that must be reachable without a token say @Public().
 */
@Controller('auth/staff')
@StaffRoute()
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  /**
   * Stricter than the global 120/min: this is the one endpoint where guessing
   * is the attack, and a back office has few enough people that ten attempts a
   * minute from one address is already generous.
   */
  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: StaffLoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  refresh(@Body() dto: StaffRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Body() dto: StaffRefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  /** Turns an invitation into an account, and signs it in. */
  @Post('accept-invite')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto);
  }

  /**
   * Always 202, whether or not the address belongs to anyone — the response
   * must not be a way to find out who works here.
   */
  @Post('forgot-password')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ sent: true }> {
    await this.auth.forgotPassword(dto.email);
    return { sent: true };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  /** Who the caller is, read from the database rather than the token — a role
   *  granted a minute ago is not in the current access token. */
  @Get('me')
  me(@CurrentStaff() staff: StaffJwtPayload) {
    return this.auth.me(staff.sub);
  }
}
