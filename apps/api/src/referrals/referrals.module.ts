import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { CouponsService } from './coupons.service';

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService, CouponsService],
  exports: [ReferralsService, CouponsService],
})
export class ReferralsModule {}
