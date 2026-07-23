import { Controller, Get } from '@nestjs/common';
import { CurrentUser, RequiresVerifiedPhone } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { ReferralsService } from './referrals.service';
import { CouponsService } from './coupons.service';

@Controller()
@RequiresVerifiedPhone()
export class ReferralsController {
  constructor(
    private readonly referrals: ReferralsService,
    private readonly coupons: CouponsService,
  ) {}

  /** Creates the caller's referral code on first read — most accounts never
   *  open this screen, so a code nobody has seen is a row nobody needs. */
  @Get('referrals/me')
  me(@CurrentUser() user: JwtPayload) {
    return this.referrals.summary(user.sub);
  }

  @Get('coupons')
  listCoupons(@CurrentUser() user: JwtPayload) {
    return this.coupons.list(user.sub);
  }
}
