import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MetricsService } from './metrics.service';

/** AuthModule is imported for TokenService — a role change revokes the
 *  account's sessions. */
@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, MetricsService],
})
export class AdminModule {}
