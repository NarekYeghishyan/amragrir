import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RefreshDto, SendCodeDto, VerifyCodeDto } from './dto';
import { Public } from './decorators';

/** Pulls the bearer value out of an Authorization header, if present. */
function bearerFrom(header?: string): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/**
 * All routes here are @Public — they are how a caller obtains a token — so
 * they carry a tighter per-IP limit than the global default. These are the
 * endpoints worth spraying: OTP sends cost money and code guesses are cheap.
 */
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  sendCode(@Body() dto: SendCodeDto) {
    return this.auth.sendCode(dto);
  }

  /** Public, but honours an optional bearer: a guest presenting their token
   *  gets that account upgraded rather than a second one created. */
  @Public()
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  verifyCode(@Body() dto: VerifyCodeDto, @Headers('authorization') authorization?: string) {
    return this.auth.verifyCode(dto, bearerFrom(authorization));
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
