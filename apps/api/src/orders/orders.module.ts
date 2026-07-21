import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/** Depends on payments (cancelling has to reverse a charge) and not the other
 *  way round — PaymentsService reads orders through Prisma, so there is no cycle. */
@Module({
  imports: [PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
