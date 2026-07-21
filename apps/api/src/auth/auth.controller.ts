import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshDto, SendCodeDto, VerifyCodeDto } from './dto';
import { Public } from './decorators';

/** All routes here are @Public — they are how a caller obtains a token. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  sendCode(@Body() dto: SendCodeDto) {
    return this.auth.sendCode(dto);
  }

  @Public()
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyCode(dto);
  }

  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.OK)
  guest() {
    return this.auth.createGuest();
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
