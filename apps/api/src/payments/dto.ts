import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaymentMethod } from '@amragrir/shared';

export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsIn(Object.values(PaymentMethod))
  method!: PaymentMethod;

  /**
   * Wallet/card token produced by the client SDK. Optional because `cash`
   * needs none. Note what is *not* here: no amount. The server reads the total
   * from the order, so a client cannot decide what it pays.
   */
  @IsString()
  @IsOptional()
  @MaxLength(4096)
  token?: string;
}
