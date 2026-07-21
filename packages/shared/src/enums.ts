// Statuses and roles — see docs/BUSINESS_LOGIC.md and docs/ROLES_AND_PERMISSIONS.md.
// Do not duplicate these as inline string literals in api/mobile/web/admin.

export const Role = {
  Guest: 'guest',
  Customer: 'customer',
  Staff: 'staff',
  Owner: 'owner',
  Admin: 'admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ServiceMode = {
  Pickup: 'pickup',
  DineIn: 'dine_in',
} as const;
export type ServiceMode = (typeof ServiceMode)[keyof typeof ServiceMode];

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

export const PaymentMethod = {
  ApplePay: 'apple_pay',
  GooglePay: 'google_pay',
  Card: 'card',
  Cash: 'cash',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
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
