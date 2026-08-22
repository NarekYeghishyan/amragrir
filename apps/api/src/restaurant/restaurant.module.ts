import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { StaffModule } from '../staff/staff.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RestaurantController } from './restaurant.controller';
import { RestaurantOrdersService } from './orders.service';
import { MenuService } from './menu.service';
import { MenuSectionsService } from './menu-sections.service';
import { MenuHistoryService } from './menu-history.service';
import { RestaurantReservationsService } from './reservations.service';
import { BookingSettingsService } from './booking-settings.service';

/** Reuses `OrdersService.transition` and `ReservationsService.settle` rather
 *  than writing its own status updates, so the refund rules, the deposit
 *  outcomes and the broadcast each exist in exactly one place. */
@Module({
  // StaffModule for the directory service: a restaurant's own page lists its
  // people, and that query belongs where every other reach-scoped people query
  // already is.
  imports: [OrdersModule, ReservationsModule, StaffModule, NotificationsModule],
  controllers: [RestaurantController],
  providers: [
    RestaurantOrdersService,
    MenuService,
    MenuSectionsService,
    MenuHistoryService,
    RestaurantReservationsService,
    BookingSettingsService,
  ],
})
export class RestaurantModule {}
