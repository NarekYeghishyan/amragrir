import { BadRequestException } from '@nestjs/common';

const ARMENIA_CC = '374';
/** Armenian mobile subscriber numbers are 8 digits after the country code. */
const NATIONAL_LENGTH = 8;

/**
 * Normalises user input to E.164 (`+374XXXXXXXX`).
 *
 * The design's phone field shows `99 123 456`, so input arrives with spaces
 * and without a country code — everything is normalised to one canonical form
 * because `users.phone` is unique and OTP keys are derived from it. Two
 * spellings of the same number must never become two accounts.
 */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException('Phone number is required');
  }

  // Keep digits only; remember whether the caller wrote an explicit '+'.
  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (digits.length === 0) {
    throw new BadRequestException('Phone number must contain digits');
  }

  // 00374... -> 374...
  if (!hadPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Local form with a trunk prefix: 0XXXXXXXX -> XXXXXXXX
  if (digits.length === NATIONAL_LENGTH + 1 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Bare national number -> prepend the country code.
  if (digits.length === NATIONAL_LENGTH) {
    digits = ARMENIA_CC + digits;
  }

  if (!digits.startsWith(ARMENIA_CC) || digits.length !== ARMENIA_CC.length + NATIONAL_LENGTH) {
    throw new BadRequestException('Enter a valid Armenian phone number, e.g. +374 99 123 456');
  }

  return `+${digits}`;
}

/** Masks all but the last two digits for logs and responses. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) {
    return phone;
  }
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}
