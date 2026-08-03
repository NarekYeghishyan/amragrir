import { BadRequestException } from '@nestjs/common';
import { DEFAULT_PHONE_COUNTRY, countryOfE164, toE164 } from '@amragrir/shared';

/**
 * Normalises user input to E.164 (`+<dial><subscriber>`).
 *
 * The design's phone field shows `99 123 456`, so input arrives with spaces
 * and often without a country code — everything is normalised to one canonical
 * form because `users.phone` is unique and OTP keys are derived from it. Two
 * spellings of the same number must never become two accounts.
 *
 * Two readings, tried in this order:
 *
 * 1. **A whole international number.** Matched against the dial codes in
 *    `PHONE_COUNTRIES` (packages/shared), which the sign-in form is built from,
 *    so the two cannot offer different countries.
 * 2. **A bare national number**, which is read as Armenian. This is the market,
 *    and it is what someone typing their own number means — it is also why
 *    every pre-existing Armenian spelling keeps working unchanged.
 *
 * That order matters: `37499123456` is a whole Armenian number and must not be
 * mistaken for a national one, while `99123456` is national and matches no
 * dial code at all.
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

  const international = countryOfE164(digits);
  if (international) {
    return `+${digits}`;
  }

  // Not a whole number, so read it as a local one — in the market's country.
  const national = toE164(DEFAULT_PHONE_COUNTRY, digits);
  if (!national) {
    throw new BadRequestException(
      `Enter a valid phone number, e.g. +${DEFAULT_PHONE_COUNTRY.dial} ${DEFAULT_PHONE_COUNTRY.example}`,
    );
  }

  return national;
}

/** Masks all but the last two digits for logs and responses. */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) {
    return phone;
  }
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}
