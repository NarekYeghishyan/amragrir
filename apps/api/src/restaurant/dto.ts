import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { OrderStatus, QueueFilter } from '@amragrir/shared';

/**
 * Statuses the restaurant may set.
 *
 * `paid` is absent on purpose: only a payment makes an order paid, and letting
 * a panel set it would let a restaurant mark an unpaid order as settled.
 */
export const STAFF_SETTABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
];

export class SetOrderStatusDto {
  @IsIn(STAFF_SETTABLE_STATUSES)
  status!: OrderStatus;
}

/**
 * `QueueFilter` moved to `@amragrir/shared` when it grew past active/past — the
 * panel renders a tab per value and has to agree with what this filters by.
 * Re-exported so existing imports of it from here keep working.
 */
export { QueueFilter } from '@amragrir/shared';

export class ListQueueDto {
  /** Which stage of the queue. `active` (the live board) when absent — the two
   *  original values, `active` and `past`, still mean what they did. */
  @IsIn(Object.values(QueueFilter))
  @IsOptional()
  status?: QueueFilter;

  /**
   * Order code, pickup code, or customer name.
   *
   * One box rather than three, because whoever is typing knows which of them
   * they have. The pickup code needs no case of its own: it is the last four
   * digits of `code`, so a substring match finds an order by either.
   */
  @IsString()
  @IsOptional()
  @MaxLength(60)
  q?: string;

  /** Narrow to one restaurant. Like `branchId`, this narrows the caller's own
   *  reach and never widens it. */
  @IsUUID()
  @IsOptional()
  restaurantId?: string;

  /** Narrow to one branch. Ignored if the caller has no access to it — the
   *  scope filter is applied on top, never replaced by this. */
  @IsUUID()
  @IsOptional()
  branchId?: string;

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
