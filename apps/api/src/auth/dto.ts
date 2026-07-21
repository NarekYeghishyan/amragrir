import { IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class SendCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;
}

export class VerifyCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @Matches(/^\d+$/, { message: 'code must contain digits only' })
  @Length(4, 6)
  code!: string;

  /** Sent on the register branch of the auth screen. */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  /** Referral code the user was invited with, if any. */
  @IsString()
  @IsOptional()
  @MaxLength(16)
  referralCode?: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
