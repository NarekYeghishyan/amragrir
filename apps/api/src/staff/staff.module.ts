import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../email/email.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffController } from './staff.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffDirectoryService } from './staff-directory.service';
import { StaffActivityService } from './staff-activity.service';
import { ImpersonationService } from './impersonation.service';
import { StaffTokenService } from './staff-token.service';
import { PasswordService } from './password.service';
import { InvitesService } from './invites.service';

@Module({
  imports: [
    EmailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [StaffAuthController, StaffController],
  providers: [
    StaffAuthService,
    StaffDirectoryService,
    StaffActivityService,
    ImpersonationService,
    StaffTokenService,
    PasswordService,
    InvitesService,
  ],
  // StaffTokenService is exported so the global StaffAuthGuard can verify
  // tokens; InvitesService so creating a restaurant can invite its admin;
  // StaffDirectoryService so a restaurant's own page can list its people
  // without a second implementation of "you only see your own reach".
  exports: [StaffTokenService, InvitesService, PasswordService, StaffDirectoryService],
})
export class StaffModule {}
