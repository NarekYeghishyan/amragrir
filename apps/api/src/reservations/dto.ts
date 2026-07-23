import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ACTIVE_RESERVATION_STATUSES,
  PaymentMethod,
  RESERVATION_MAX_GUESTS,
  ReservationStatus,
} from '@amragrir/shared';

export class AvailabilityQueryDto {
  /** Local calendar date in Yerevan, `YYYY-MM-DD`. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsInt()
  @Min(1)
  @Max(RESERVATION_MAX_GUESTS)
  @Type(() => Number)
  guests = 2;
}

export class CreateReservationDto {
  @IsUUID()
  branchId!: string;

  /** Absolute instant; must land exactly on an offered slot. */
  @IsISO8601()
  reservedFor!: string;

  @IsInt()
  @Min(1)
  @Max(RESERVATION_MAX_GUESTS)
  @Type(() => Number)
  guests!: number;

  /**
   * How the deposit is held. No amount field — the server computes the deposit
   * from the party size, exactly as it computes an order total.
   */
  @IsIn(Object.values(PaymentMethod))
  @IsOptional()
  depositMethod: PaymentMethod = PaymentMethod.Card;

  @IsString()
  @IsOptional()
  @MaxLength(4096)
  depositToken?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

export const ReservationListFilter = {
  Upcoming: 'upcoming',
  Past: 'past',
} as const;
export type ReservationListFilter =
  (typeof ReservationListFilter)[keyof typeof ReservationListFilter];

export class ListReservationsDto {
  @IsIn(Object.values(ReservationListFilter))
  @IsOptional()
  status?: ReservationListFilter;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 20;
}

/** Owner-side status changes. `confirmed`, `seated`, `completed`, `no_show`. */
export class SetReservationStatusDto {
  @IsIn(Object.values(ReservationStatus))
  status!: ReservationStatus;
}

export class ListOwnerReservationsDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  /** Local date to show; defaults to everything still active. */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  @IsOptional()
  date?: string;

  @IsIn(Object.values(ReservationStatus))
  @IsOptional()
  status?: ReservationStatus;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 50;
}

export const ACTIVE_RESERVATION_STATUS_LIST = [...ACTIVE_RESERVATION_STATUSES];
