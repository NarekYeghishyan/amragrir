import { Module } from '@nestjs/common';
import { ConsolePaymentProvider } from './console-payment.provider';
import { PAYMENT_PROVIDER } from './payment.provider';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/** Swap the `useClass` here for a real acquirer once one is chosen — nothing
 *  else in the app names a provider. */
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PAYMENT_PROVIDER, useClass: ConsolePaymentProvider }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
