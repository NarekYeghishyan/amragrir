import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { OrderEventsModule } from '../orders/order-events.module';
import { NotificationsController } from './notifications.controller';
import { CustomerNotificationsController } from './customer-notifications.controller';
import { StaffNotificationsService } from './staff-notifications.service';
import { CustomerNotificationsService } from './customer-notifications.service';
import { CustomerNotificationEventsService } from './customer-notification-events.service';
import { OrderRemindersService } from './order-reminders.service';
import { OrderPlacedNotificationsService } from './order-placed-notifications.service';
import { ReservationNotificationsService } from './reservation-notifications.service';
import { BookingRemindersService } from './booking-reminders.service';

/**
 * Telling a branch what it needs to know before it needs to know it.
 *
 * `ScheduleModule.forRoot()` is registered **here** rather than in `AppModule`,
 * because this module owns the only scheduled job in the API. Wiring the timer
 * infrastructure globally would invite the next background task to be dropped
 * anywhere; keeping it beside the one job that uses it means the next one has to
 * be a deliberate decision about where it belongs.
 */
@Module({
  // OrderEventsModule is a leaf (it provides the emitter and imports nothing),
  // so depending on it here does not put this module in a cycle with
  // OrdersModule — which imports *this* one for the gateway's subscriptions.
  // CustomerNotificationsService listens to that emitter rather than being
  // called by the services that move an order; see its `onModuleInit`.
  imports: [ScheduleModule.forRoot(), PrismaModule, RedisModule, OrderEventsModule],
  controllers: [NotificationsController, CustomerNotificationsController],
  providers: [
    StaffNotificationsService,
    OrderRemindersService,
    CustomerNotificationsService,
    CustomerNotificationEventsService,
    OrderPlacedNotificationsService,
    ReservationNotificationsService,
    BookingRemindersService,
  ],
  // The customer emitter is exported for the orders gateway, which pushes these
  // to whichever socket said `watchMe`.
  exports: [
    StaffNotificationsService,
    CustomerNotificationEventsService,
    ReservationNotificationsService,
  ],
})
export class NotificationsModule {}
