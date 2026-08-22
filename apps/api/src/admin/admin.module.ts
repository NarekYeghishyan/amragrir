import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CategoriesAdminService } from './categories.service';
import { MetricsService } from './metrics.service';

/** StaffModule is imported for InvitesService — creating a restaurant invites
 *  the person who will administer it, since there is no longer a customer
 *  account to name as its owner. */
@Module({
  imports: [StaffModule],
  controllers: [AdminController],
  providers: [AdminService, MetricsService, CategoriesAdminService],
})
export class AdminModule {}
