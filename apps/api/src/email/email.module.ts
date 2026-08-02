import { Module } from '@nestjs/common';
import { ConsoleEmailSender } from './console-email.sender';
import { EMAIL_SENDER } from './email.sender';

/** Swap the `useClass` here for a real provider when one is chosen. */
@Module({
  providers: [{ provide: EMAIL_SENDER, useClass: ConsoleEmailSender }],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
