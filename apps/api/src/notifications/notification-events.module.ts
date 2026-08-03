import { Global, Module } from '@nestjs/common';
import { NotificationEventsService } from './notification-events.service';

/**
 * The staff notification fan-out, on its own so that both ends can reach it.
 *
 * The reminder job publishes; the orders gateway broadcasts. Neither should
 * import the other — one is a background sweep and the other is a socket — so
 * the emitter they share lives here, exactly as `OrderEventsModule` does for
 * order status changes.
 */
@Global()
@Module({
  providers: [NotificationEventsService],
  exports: [NotificationEventsService],
})
export class NotificationEventsModule {}
