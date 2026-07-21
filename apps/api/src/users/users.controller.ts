import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { JwtPayload } from '../auth/token.service';
import { UpdateLanguageDto, UpdateMeDto, UpdateSettingsDto } from './dto';
import { MeProfile, UsersService } from './users.service';

/** Authenticated by the global JwtAuthGuard — guests included, since they may
 *  read and adjust their own profile (language/theme) before verifying. */
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() user: JwtPayload): Promise<MeProfile> {
    return this.users.getProfile(user.sub);
  }

  @Patch()
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto): Promise<MeProfile> {
    return this.users.updateProfile(user.sub, dto);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSettingsDto,
  ): Promise<MeProfile> {
    return this.users.updateSettings(user.sub, dto);
  }

  @Patch('language')
  updateLanguage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLanguageDto,
  ): Promise<MeProfile> {
    return this.users.updateLanguage(user.sub, dto);
  }
}
