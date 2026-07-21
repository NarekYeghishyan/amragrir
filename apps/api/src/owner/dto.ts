import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { OrderStatus } from '@amragrir/shared';

/**
 * Statuses the restaurant may set.
 *
 * `paid` is absent on purpose: only a payment makes an order paid, and letting
 * a panel set it would let a restaurant mark an unpaid order as settled.
 */
export const OWNER_SETTABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
];

export class SetOrderStatusDto {
  @IsIn(OWNER_SETTABLE_STATUSES)
  status!: OrderStatus;
}

export const OwnerQueueFilter = {
  Active: 'active',
  Past: 'past',
} as const;
export type OwnerQueueFilter = (typeof OwnerQueueFilter)[keyof typeof OwnerQueueFilter];

export class ListOwnerOrdersDto {
  @IsIn(Object.values(OwnerQueueFilter))
  @IsOptional()
  status?: OwnerQueueFilter;

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
