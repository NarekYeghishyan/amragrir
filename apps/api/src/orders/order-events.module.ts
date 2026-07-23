import { Global, Module } from '@nestjs/common';
import { OrderEventsService } from './order-events.service';

/** Global because both orders and payments publish to it, and the gateway
 *  subscribes — importing it three ways round would create a cycle. */
@Global()
@Module({
  providers: [OrderEventsService],
  exports: [OrderEventsService],
})
export class OrderEventsModule {}
