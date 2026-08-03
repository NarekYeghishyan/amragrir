import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { NotificationsController } from './notifications.controller';
import { StaffNotificationsService } from './staff-notifications.service';
import { OrderRemindersService } from './order-reminders.service';

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
  imports: [ScheduleModule.forRoot(), PrismaModule, RedisModule],
  controllers: [NotificationsController],
  providers: [StaffNotificationsService, OrderRemindersService],
  exports: [StaffNotificationsService],
})
export class NotificationsModule {}
