import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ORDER_MAX_ITEM_QTY, ORDER_MAX_LINES, ServiceMode } from '@amragrir/shared';

export class OrderItemInputDto {
  @IsUUID()
  menuItemId!: string;

  // Bounded so a typo (or a hostile client) cannot ask a kitchen for 10,000
  // burgers, and so the line total cannot be pushed towards integer overflow.
  @IsInt()
  @Min(1)
  @Max(ORDER_MAX_ITEM_QTY)
  @Type(() => Number)
  qty!: number;
}

/** Shared by the basket quote and order creation — the two must price the
 *  same basket identically, so they take the same input. */
export class BasketDto {
  @IsUUID()
  branchId!: string;

  @IsIn(Object.values(ServiceMode))
  serviceMode: ServiceMode = ServiceMode.Pickup;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ORDER_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];

  /**
   * Required for `dine_in`, rejected otherwise by the service: food brought to
   * a table needs a table, and that means a booking.
   */
  @IsUUID()
  @IsOptional()
  reservationId?: string;

  /** A coupon the caller holds. Priced server-side; the client never says how
   *  much it is worth. */
  @IsString()
  @IsOptional()
  @MaxLength(20)
  couponCode?: string;
}

export class CreateOrderDto extends BasketDto {
  /** When the customer wants the food ready. Defaults to the prep estimate. */
  @IsISO8601()
  @IsOptional()
  readyAt?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}

export const OrderListFilter = {
  Active: 'active',
  Past: 'past',
} as const;
export type OrderListFilter = (typeof OrderListFilter)[keyof typeof OrderListFilter];

export class ListOrdersDto {
  @IsIn(Object.values(OrderListFilter))
  @IsOptional()
  status?: OrderListFilter;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  // Capped server-side, like every other list (DEVELOPMENT_GUIDE.md).
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 20;
}
