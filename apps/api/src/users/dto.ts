import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Language } from '@amragrir/shared';

export class UpdateMeDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(160)
  email?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateSettingsDto {
  @IsBoolean()
  @IsOptional()
  notifPush?: boolean;

  @IsBoolean()
  @IsOptional()
  notifPromo?: boolean;

  @IsBoolean()
  @IsOptional()
  darkMode?: boolean;
}

export class UpdateLanguageDto {
  @IsIn(Object.values(Language))
  language!: Language;
}
