import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { OrdersService } from './orders.service';

/** Depends on payments (cancelling has to reverse a charge) and not the other
 *  way round — PaymentsService reads orders through Prisma, so there is no cycle.
 *  AuthModule is here for the gateway, which verifies tokens itself. */
@Module({
  imports: [PaymentsModule, AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService],
})
export class OrdersModule {}
