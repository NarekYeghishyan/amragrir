import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  OrderStatus,
  PICKUP_CODE_LENGTH,
  PICKUP_CODE_PATTERN,
  QueueFilter,
  REMINDER_LEAD_MAX_MINUTES,
  REMINDER_LEAD_MIN_MINUTES,
} from '@amragrir/shared';

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

  /**
   * The code the guest showed, on the one move that hands the food over.
   *
   * Required exactly when `status` is `completed` and refused as noise on every
   * other step — `@ValidateIf` rather than `@IsOptional`, so "mark it ready
   * without a code" stays a legal request and "mark it collected without one"
   * is rejected before the service is reached.
   *
   * The shape is checked here and the *value* in the service, against the order
   * being closed. Both are needed: this one keeps a stray "1234" from becoming
   * a database lookup, and only the service knows which order is being asked
   * about.
   */
  @ValidateIf((dto: SetOrderStatusDto) => dto.status === OrderStatus.Completed)
  @IsString()
  @Matches(PICKUP_CODE_PATTERN, { message: `pickupCode must be ${PICKUP_CODE_LENGTH} digits` })
  pickupCode?: string;
}

/**
 * How much notice the branch wants on one pre-order.
 *
 * Minutes before the food is due, which is the number as the shift says it —
 * "warn me forty-five minutes before". The default came from the menu's prep
 * estimate, and this is where somebody who knows the dish overrides it: an
 * estimate is the slowest line on a ticket, and lighting the coals for a skewer
 * is not on the ticket at all.
 *
 * Bounded in `shared` rather than here, because the panel's input has to refuse
 * the same numbers this does — a form that offers a value the API rejects is a
 * form that wastes somebody's time at the pass.
 */
export class SetOrderReminderDto {
  @IsInt()
  @Min(REMINDER_LEAD_MIN_MINUTES)
  @Max(REMINDER_LEAD_MAX_MINUTES)
  @Type(() => Number)
  leadMin!: number;
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
   * they have. The pickup code *does* need a case of its own now that it is not
   * the tail of `code` — and it is matched whole, not as a substring, so the
   * box cannot be used to list every order whose code happens to contain a `7`.
   * See `RestaurantOrdersService.listOrders`.
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
