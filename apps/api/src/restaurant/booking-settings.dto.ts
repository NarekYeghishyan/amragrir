import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { BOOKING_POLICY_LIMITS } from '@amragrir/shared';

/**
 * What the back office may say about how a branch takes bookings.
 *
 * The bounds here are the ones in `BOOKING_POLICY_LIMITS`, referenced rather
 * than retyped: a limit in two places is a limit that will eventually differ,
 * and the panel disables its fields from the same object.
 *
 * **Every policy field accepts `null` explicitly, and that is not the same as
 * omitting it.** Omitted means "leave this as it is"; `null` means "stop
 * deciding this here and follow the level above". A form that could only send
 * numbers would be a form from which inheritance, once broken, could never be
 * restored.
 */

/** `HH:MM`, 00:00 through 24:00. */
const HH_MM = /^(?:[01]\d|2[0-4]):[0-5]\d$/;

export class TableDto {
  @IsString()
  @MaxLength(10)
  @Matches(/\S/, { message: 'tableNo cannot be blank' })
  tableNo!: string;

  // One seat is a real table — a bar stool at the window. The ceiling is the
  // platform's party cap, because a banquet hall is entered as one table and
  // there would be no point accepting a party this could not hold.
  @IsInt()
  @Min(1)
  @Max(BOOKING_POLICY_LIMITS.maxGuests.max)
  @Type(() => Number)
  seats!: number;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  zone?: string;
}

export class UpdateTableDto {
  @IsString()
  @IsOptional()
  @MaxLength(10)
  @Matches(/\S/, { message: 'tableNo cannot be blank' })
  tableNo?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(BOOKING_POLICY_LIMITS.maxGuests.max)
  @Type(() => Number)
  seats?: number;

  /** `null` clears the zone; omitting it leaves whatever is there. */
  @ValidateIf((dto: UpdateTableDto) => dto.zone !== null)
  @IsString()
  @IsOptional()
  @MaxLength(40)
  zone?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * A week of booking hours, or `null` to take bookings whenever the kitchen is
 * open.
 *
 * The shape is validated here rather than trusted into a JSON column, because
 * `open_hours` is read by a parser that falls back generously on anything it
 * cannot understand — which is right for reading a column nobody validates, and
 * wrong as a way of accepting a form. A branch that types `10:0` should be told,
 * not silently given the platform default at dinner time.
 */
export class SetBookingHoursDto {
  @ValidateIf((dto: SetBookingHoursDto) => dto.bookingHours !== null)
  @IsObject()
  bookingHours!: WeeklyHours | null;
}

export interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}
export type WeeklyHours = Record<string, DayHours>;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * Whether a weekly hours document is one this platform can read back.
 *
 * Returns the offending key, or null. Written as a function rather than a nest
 * of decorators because the document is a map with optional members, and
 * `class-validator` expresses that far less clearly than eight lines do.
 */
export function invalidHours(hours: WeeklyHours): string | null {
  for (const [key, entry] of Object.entries(hours)) {
    if (key !== 'default' && !(WEEKDAYS as readonly string[]).includes(key)) {
      return key;
    }
    if (entry === null || typeof entry !== 'object') {
      return key;
    }
    if (entry.closed === true) {
      continue;
    }
    if (!HH_MM.test(entry.open ?? '') || !HH_MM.test(entry.close ?? '')) {
      return key;
    }
  }
  return null;
}

export const ClosureKindValue = {
  Closed: 'closed',
  CustomHours: 'custom_hours',
} as const;
export type ClosureKindValue = (typeof ClosureKindValue)[keyof typeof ClosureKindValue];

export class CreateClosureDto {
  /** Local calendar date in Yerevan, `YYYY-MM-DD`. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsIn(Object.values(ClosureKindValue))
  kind!: ClosureKindValue;

  /** Required for `custom_hours`, refused for `closed` — the service checks the
   *  pairing, and the database has a CHECK behind it. */
  @ValidateIf((dto: CreateClosureDto) => dto.kind === ClosureKindValue.CustomHours)
  @Matches(HH_MM, { message: 'open must be HH:MM' })
  open?: string;

  @ValidateIf((dto: CreateClosureDto) => dto.kind === ClosureKindValue.CustomHours)
  @Matches(HH_MM, { message: 'close must be HH:MM' })
  close?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  reason?: string;
}

/** Every field optional, and every one nullable — see the note at the top. */
export class UpdateBookingPolicyDto {
  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.seatingMinutes !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.seatingMinutes.min)
  @Max(BOOKING_POLICY_LIMITS.seatingMinutes.max)
  @Type(() => Number)
  seatingMinutes?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.slotMinutes !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.slotMinutes.min)
  @Max(BOOKING_POLICY_LIMITS.slotMinutes.max)
  @Type(() => Number)
  slotMinutes?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.maxGuests !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.maxGuests.min)
  @Max(BOOKING_POLICY_LIMITS.maxGuests.max)
  @Type(() => Number)
  maxGuests?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.maxLeadDays !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.maxLeadDays.min)
  @Max(BOOKING_POLICY_LIMITS.maxLeadDays.max)
  @Type(() => Number)
  maxLeadDays?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.minLeadMinutes !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.minLeadMinutes.min)
  @Max(BOOKING_POLICY_LIMITS.minLeadMinutes.max)
  @Type(() => Number)
  minLeadMinutes?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.depositPerGuestAmd !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.depositPerGuestAmd.min)
  @Max(BOOKING_POLICY_LIMITS.depositPerGuestAmd.max)
  @Type(() => Number)
  depositPerGuestAmd?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.freeCancelHours !== null)
  @IsInt()
  @IsOptional()
  @Min(BOOKING_POLICY_LIMITS.freeCancelHours.min)
  @Max(BOOKING_POLICY_LIMITS.freeCancelHours.max)
  @Type(() => Number)
  freeCancelHours?: number | null;

  @ValidateIf((dto: UpdateBookingPolicyDto) => dto.autoConfirm !== null)
  @IsBoolean()
  @IsOptional()
  autoConfirm?: boolean | null;
}

export class BookingPreviewDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(BOOKING_POLICY_LIMITS.maxGuests.max)
  @Type(() => Number)
  guests = 2;
}

/** Moving a booking to a different table by hand. */
export class SetReservationTableDto {
  @IsString()
  tableId!: string;
}

/**
 * Acknowledging that a change breaks bookings that already exist.
 *
 * A query flag rather than a field in the body, because it is not part of what
 * is being saved — it is the answer to a question the first attempt asked. The
 * first save comes back 409 with the list; the same request with `force=true`
 * goes through and changes nothing about the bookings themselves.
 */
export class ForceDto {
  @IsOptional()
  @IsIn(['true', 'false', ''])
  force?: string;
}

export function isForced(query: ForceDto): boolean {
  return query.force === 'true' || query.force === '';
}
