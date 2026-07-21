import { Module } from '@nestjs/common';
import { ConsoleSmsSender } from './console-sms.sender';
import { SMS_SENDER } from './sms.sender';

/** Swap the `useClass` here for a real gateway when a provider is chosen. */
@Module({
  providers: [{ provide: SMS_SENDER, useClass: ConsoleSmsSender }],
  exports: [SMS_SENDER],
})
export class SmsModule {}
