import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, Public, RequiresVerifiedPhone } from '../auth/decorators';
import { Idempotent } from '../common/idempotency/idempotency.decorator';
import type { JwtPayload } from '../auth/token.service';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Static list — the checkout screen renders it before anyone signs in. */
  @Get('payment-methods')
  @Public()
  methods() {
    return this.payments.methods();
  }

  @Post('payments')
  @RequiresVerifiedPhone()
  @Idempotent('payments.create')
  pay(@CurrentUser() user: JwtPayload, @Body() dto: CreatePaymentDto) {
    return this.payments.pay(user.sub, dto);
  }
}
