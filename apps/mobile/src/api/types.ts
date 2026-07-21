/**
 * Response shapes from the API. Statuses, roles and business constants come
 * from `@amragrir/shared`; these interfaces describe only the transport shape
 * of each endpoint (API_DOCUMENTATION.md).
 */
import type { Language, Role } from '@amragrir/shared';

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
