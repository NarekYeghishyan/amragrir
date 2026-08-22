import {
  OrderActorType,
  OrderEventType,
  OrderStatus,
  ReservationStatus,
  Role,
  ServiceMode,
  StaffNotificationType,
  REFERRAL_DISCOUNT_PCT,
  REFERRAL_MAX_STACK_PCT,
  SERVICE_FEE_AMD,
  DEPOSIT_PER_GUEST_AMD,
} from '@amragrir/shared';

/**
 * No API code imports @amragrir/shared yet (the first real use lands with the
 * auth guards in Phase 1), so this proves the workspace package actually
 * resolves from the CommonJS API build rather than leaving it untested until
 * something depends on it.
 */
describe('@amragrir/shared wiring', () => {
  it('resolves enums from the workspace package', () => {
    expect(OrderStatus.Paid).toBe('paid');
    expect(OrderStatus.AlmostReady).toBe('almost_ready');
    expect(ReservationStatus.NoShow).toBe('no_show');
    expect(Role.Customer).toBe('customer');
    expect(ServiceMode.DineIn).toBe('dine_in');
  });

  it('exposes the business constants documented in BUSINESS_LOGIC.md', () => {
    expect(SERVICE_FEE_AMD).toBe(360);
    expect(DEPOSIT_PER_GUEST_AMD).toBe(2000);
    expect(REFERRAL_DISCOUNT_PCT).toBe(2);
    expect(REFERRAL_MAX_STACK_PCT).toBe(25);
  });

  it('keeps DB enum values byte-identical to the Prisma schema strings', () => {
    // Prisma generates its own enums; a drift here means a status written by
    // the API would not match the column type.
    const orderStatuses = Object.values(OrderStatus);
    expect(orderStatuses).toEqual([
      'created',
      'paid',
      'confirmed',
      'preparing',
      'almost_ready',
      'ready',
      'completed',
      'cancelled',
    ]);

    // `order_events.type` and `order_events.actor_type` are Postgres enums too,
    // so the same drift would make every history write fail at the column.
    expect(Object.values(OrderEventType)).toEqual([
      'created',
      'status_changed',
      'payment',
      'reminder_set',
    ]);
    expect(Object.values(OrderActorType)).toEqual(['customer', 'staff', 'system']);
    // `staff_notifications.type` is one too, and the bell switches on it.
    expect(Object.values(StaffNotificationType)).toEqual([
      'prep_due',
      'order_placed',
      'booking_placed',
    ]);
  });
});
