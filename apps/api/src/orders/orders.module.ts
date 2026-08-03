import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { StaffModule } from '../staff/staff.module';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersService } from './orders.service';
import { OrderHistoryService } from './order-history.service';

/** Depends on payments (cancelling has to reverse a charge) and not the other
 *  way round — PaymentsService reads orders through Prisma, so there is no cycle.
 *  AuthModule and StaffModule are here for the gateway, which verifies tokens
 *  itself and accepts either identity: the customer watching their order, or
 *  the kitchen working it. */
@Module({
  // NotificationsModule for the gateway's branch subscription: a panel watching
  // a board has to be told which branches it may hear about, and that answer
  // comes from the same scope the REST board is filtered by.
  imports: [PaymentsModule, AuthModule, ReferralsModule, StaffModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway, OrderHistoryService],
  // The history is read by the back office (the order card's History button)
  // and written by the services in this module — so the reader is exported and
  // the writing stays where the changes happen.
  exports: [OrdersService, OrderHistoryService],
})
export class OrdersModule {}
