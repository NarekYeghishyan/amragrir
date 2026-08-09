// Statuses and roles — see docs/BUSINESS_LOGIC.md and docs/ROLES_AND_PERMISSIONS.md.
// Do not duplicate these as inline string literals in api/mobile/web/admin.

/**
 * What a person using the *customer* apps is.
 *
 * `guest` is not a database value — it is the `users.is_guest` flag, and it
 * stays in this enum because the apps reason about it as a role.
 *
 * Staff, owners and administrators are **not** here: they are separate accounts
 * with their own table and their own roles (see `StaffRole`). A customer record
 * can no longer be promoted into one.
 */
export const Role = {
  Guest: 'guest',
  Customer: 'customer',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/**
 * What a person using the *back office* is — see ROLE_PERMISSIONS in
 * `staff-roles.ts` for what each may do, and docs/ROLES_AND_PERMISSIONS.md for
 * why the two identities are separate.
 *
 * Ordered widest to narrowest. The scope a role is assigned over lives in
 * `staff_assignments`, not here: `restaurant_manager` means nothing until it
 * names a branch.
 */
export const StaffRole = {
  SuperAdmin: 'super_admin',
  PlatformAdmin: 'platform_admin',
  RestaurantAdmin: 'restaurant_admin',
  RestaurantManager: 'restaurant_manager',
  BranchStaff: 'branch_staff',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

/** Mode of a single order — the value stored in `orders.service_mode`. */
export const ServiceMode = {
  Pickup: 'pickup',
  DineIn: 'dine_in',
} as const;
export type ServiceMode = (typeof ServiceMode)[keyof typeof ServiceMode];

/**
 * What a restaurant advertises it supports — the values in
 * `restaurants.services`.
 *
 * Deliberately a separate vocabulary from ServiceMode, and spelled `dinein`
 * because that is what the design and the seeded data use. Keeping both here
 * makes the difference explicit; the two were previously spelled inconsistently
 * across the API and the database with nothing to reconcile them.
 *
 * **`eat_in` was here and is deliberately gone.** Eating where the food was
 * cooked is not something a place declares any more — it is what every counter
 * that does not take bookings does, and what no restaurant that does take them
 * offers outside its booking flow. The rule derives it from `reserve` instead,
 * so there is no switch to set it inconsistently with (BUSINESS_LOGIC.md §2).
 * `PickupOption.EatIn` keeps the string: what a guest *chose* is still recorded
 * per order, because the kitchen plates it rather than bagging it.
 *
 * Not every combination of these is a restaurant that can exist — see
 * `service-offering.ts`, which holds the rules and is what both the API and the
 * back office check against.
 */
export const RestaurantService = {
  Pickup: 'pickup',
  DineIn: 'dinein',
  Reserve: 'reserve',
} as const;
export type RestaurantService = (typeof RestaurantService)[keyof typeof RestaurantService];

// Transitions: created -> paid -> confirmed -> preparing -> almost_ready -> ready -> completed
// Cancellation allowed before `preparing` (policy TBD, see BUSINESS_LOGIC.md ​§4).
export const OrderStatus = {
  Created: 'created',
  Paid: 'paid',
  Confirmed: 'confirmed',
  Preparing: 'preparing',
  AlmostReady: 'almost_ready',
  Ready: 'ready',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * What kind of thing an entry in an order's history records.
 *
 * `payment` is for the attempts that leave the order where it is — a declined
 * card is not a status change, and without a type of its own it would be
 * invisible in the timeline that is supposed to explain why an order sat unpaid.
 */
export const OrderEventType = {
  Created: 'created',
  StatusChanged: 'status_changed',
  Payment: 'payment',
  /**
   * A branch moved when it wants warning about a pre-order.
   *
   * Not a status change: the order stays where it is and the food is still
   * promised for the same minute. What moved is the notice the kitchen gave
   * itself, which is a decision somebody made about their own shift — and the
   * only record of it, since the column it writes is overwritten in place.
   */
  ReminderSet: 'reminder_set',
} as const;
export type OrderEventType = (typeof OrderEventType)[keyof typeof OrderEventType];

/**
 * What a `staff_notifications` row is telling a branch about.
 *
 * One value so far. An enum rather than a bare string because the panel renders
 * a line per kind and must do so exhaustively — a second kind added to the
 * database and not to the bell would arrive as a blank row, and here it is a
 * compile error instead.
 */
export const StaffNotificationType = {
  /** A pre-order is coming up and the kitchen has to start soon — raised by the
   *  reminder job when `orders.reminder_at` falls due. */
  PrepDue: 'prep_due',
} as const;
export type StaffNotificationType =
  (typeof StaffNotificationType)[keyof typeof StaffNotificationType];

/**
 * Which identity is behind a history entry.
 *
 * The three are genuinely different tables and not a single "user id": a
 * customer is a `users` row, a staff member a `staff_users` row, and `system` is
 * neither — a timeout or a job that acted on nobody's behalf.
 */
export const OrderActorType = {
  Customer: 'customer',
  Staff: 'staff',
  System: 'system',
} as const;
export type OrderActorType = (typeof OrderActorType)[keyof typeof OrderActorType];

// Transitions: pending -> confirmed -> seated -> completed
// cancelled possible from pending/confirmed; confirmed -> no_show.
export const ReservationStatus = {
  Pending: 'pending',
  Confirmed: 'confirmed',
  Seated: 'seated',
  Completed: 'completed',
  Cancelled: 'cancelled',
  NoShow: 'no_show',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

/**
 * Every way an order can be paid for — all of them online.
 *
 * `cash` was here and is deliberately gone: an order is paid before the kitchen
 * ever sees it, so there is no longer a way to place one that owes money at the
 * counter. See BUSINESS_LOGIC.md §5.
 */
export const PaymentMethod = {
  ApplePay: 'apple_pay',
  GooglePay: 'google_pay',
  Card: 'card',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  /**
   * Recorded but not yet taken.
   *
   * No order payment ends up here now that cash is gone — every method either
   * captures or fails. Kept because it is a state a real acquirer produces (a
   * transfer awaiting settlement, a 3-D Secure challenge in flight), and
   * because rows written before cash was removed still carry it.
   */
  Pending: 'pending',
  Authorized: 'authorized',
  Captured: 'captured',
  Refunded: 'refunded',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const MenuTab = {
  Popular: 'popular',
  Mains: 'mains',
  Sides: 'sides',
  Drinks: 'drinks',
} as const;
export type MenuTab = (typeof MenuTab)[keyof typeof MenuTab];

export const DietaryTag = {
  Vegetarian: 'vegetarian',
  Vegan: 'vegan',
  Halal: 'halal',
  GlutenFree: 'gluten_free',
} as const;
export type DietaryTag = (typeof DietaryTag)[keyof typeof DietaryTag];

export const Language = {
  Hy: 'hy',
  Ru: 'ru',
  En: 'en',
} as const;
export type Language = (typeof Language)[keyof typeof Language];
