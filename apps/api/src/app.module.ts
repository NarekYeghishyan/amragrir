import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { GeocodeModule } from './geocode/geocode.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ReferralsModule } from './referrals/referrals.module';
import { OrderEventsModule } from './orders/order-events.module';
import { NotificationEventsModule } from './notifications/notification-events.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ReservationsModule } from './reservations/reservations.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { StaffModule } from './staff/staff.module';
import { UploadsModule } from './uploads/uploads.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { StaffAuthGuard } from './staff/staff-auth.guard';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Per-IP ceiling. The OTP cooldown is per phone number, which does nothing
    // against someone spraying thousands of different numbers from one host.
    // In-memory storage is fine for a single instance; move to the Redis
    // storage adapter before running more than one.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    RedisModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    GeocodeModule,
    OrderEventsModule,
    NotificationEventsModule,
    OrdersModule,
    PaymentsModule,
    FavoritesModule,
    ReferralsModule,
    AdminModule,
    ReservationsModule,
    RestaurantModule,
    StaffModule,
    UploadsModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limiting runs first (cheapest rejection), then
    // authentication populates request.user, then authorization reads it.
    // All global, so a new endpoint is covered by default.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // The back-office half. Inert on customer routes, and JwtAuthGuard is
    // inert on staff ones — a route belongs to exactly one of the two, which
    // is what keeps a customer token from ever reaching a staff endpoint.
    { provide: APP_GUARD, useClass: StaffAuthGuard },
    // Inert unless a handler declares @Idempotent(); registered globally so
    // adding the decorator is all a new money endpoint needs. Runs after the
    // guards, so it can scope the stored response to the authenticated user.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
