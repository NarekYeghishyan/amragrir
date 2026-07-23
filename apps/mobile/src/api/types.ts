/**
 * Response shapes from the API. Statuses, roles and business constants come
 * from `@amragrir/shared`; these interfaces describe only the transport shape
 * of each endpoint (API_DOCUMENTATION.md).
 */
import type { Language, OrderStatus, PaymentMethod, Role, ServiceMode } from '@amragrir/shared';

export interface AuthUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  language: Language;
  role: Role;
  isGuest: boolean;
  phoneVerified: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  user: AuthUser;
}

export interface GuestResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface SendCodeResult {
  sent: true;
  expiresIn: number;
}

export interface Category {
  id: string;
  key: string;
  icon: string | null;
  name: string;
}

export interface RestaurantListItem {
  id: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  distanceKm: number | null;
  prepMin: number | null;
  isOpen: boolean;
  services: string[];
  reservationsEnabled: boolean;
  coverUrl: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
}

export interface RestaurantDetail {
  id: string;
  restaurantId: string;
  slug: string;
  name: string;
  cuisine: string | null;
  priceLevel: number | null;
  rating: number;
  reviewsCount: number;
  services: string[];
  reservationsEnabled: boolean;
  coverUrl: string | null;
  branch: {
    id: string;
    name: string | null;
    address: string | null;
    city: string;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    isOpen: boolean;
    prepMin: number | null;
  };
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
}

/** Every total on this object was computed by the server — the client only
 *  formats them (DEVELOPMENT_GUIDE.md: never trust the client with money). */
export interface Quote {
  branchId: string;
  restaurantName: string;
  items: QuoteLine[];
  unavailable: { menuItemId: string; reason: 'not_on_menu' | 'sold_out' }[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  totalAmd: number;
  prepMin: number;
  earliestReadyAt: string;
  branchIsOpen: boolean;
  canOrder: boolean;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  unitPriceAmd: number;
  qty: number;
  lineTotalAmd: number;
}

export interface Order {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: ServiceMode;
  restaurantName: string;
  branch: { id: string; name: string | null; address: string | null };
  items: OrderItem[];
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  totalAmd: number;
  readyAt: string | null;
  secondsLeft: number | null;
  tableNo: string | null;
  notes: string | null;
  payment: { method: string; status: string } | null;
  createdAt: string;
}

export interface OrderListItem {
  id: string;
  code: string;
  restaurantName: string;
  coverUrl: string | null;
  date: string;
  itemsCount: number;
  totalAmd: number;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
}

export interface PaymentResult {
  id: string;
  status: string;
  amountAmd: number;
  method: PaymentMethod;
  orderStatus: OrderStatus;
}

/** What the order stream pushes (API_DOCUMENTATION.md "Realtime status"). */
export interface OrderStatusUpdate {
  orderId: string;
  code: string;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
}

export interface MenuItem {
  id: string;
  name: string;
  desc: string;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
  menuTab: string;
  categoryId: string | null;
}
