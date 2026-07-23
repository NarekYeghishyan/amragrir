import { Module } from '@nestjs/common';
import { ReferralsModule } from '../referrals/referrals.module';
import { ConsolePaymentProvider } from './console-payment.provider';
import { PAYMENT_PROVIDER } from './payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { DepositsService } from './deposits.service';

/** Swap the `useClass` here for a real acquirer once one is chosen — nothing
 *  else in the app names a provider. */
@Module({
  imports: [ReferralsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    DepositsService,
    { provide: PAYMENT_PROVIDER, useClass: ConsolePaymentProvider },
  ],
  exports: [PaymentsService, DepositsService],
})
export class PaymentsModule {}
