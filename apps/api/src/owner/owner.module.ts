import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { MenuService } from './menu.service';

/** Reuses `OrdersService.transition` rather than writing its own status
 *  update, so the refund rule and the broadcast exist in exactly one place. */
@Module({
  imports: [OrdersModule],
  controllers: [OwnerController],
  providers: [OwnerService, MenuService],
})
export class OwnerModule {}
