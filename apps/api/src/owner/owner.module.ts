import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { MenuService } from './menu.service';
import { OwnerReservationsService } from './reservations.service';

/** Reuses `OrdersService.transition` and `ReservationsService.settle` rather
 *  than writing its own status updates, so the refund rules, the deposit
 *  outcomes and the broadcast each exist in exactly one place. */
@Module({
  imports: [OrdersModule, ReservationsModule],
  controllers: [OwnerController],
  providers: [OwnerService, MenuService, OwnerReservationsService],
})
export class OwnerModule {}
