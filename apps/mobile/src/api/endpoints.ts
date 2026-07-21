import { request } from './client';
import type {
  AuthResult,
  Category,
  GuestResult,
  MenuItem,
  Paged,
  RestaurantDetail,
  RestaurantListItem,
  SendCodeResult,
} from './types';

/** Typed calls, one per endpoint. Screens never build URLs themselves. */

export const auth = {
  sendCode: (phone: string) =>
    request<SendCodeResult>('/auth/send-code', {
      method: 'POST',
      body: { phone },
      authenticated: false,
    }),

  /** Sends the current bearer when there is one, so a guest is upgraded in
   *  place rather than getting a second account (API_DOCUMENTATION.md). */
  verifyCode: (phone: string, code: string, name?: string) =>
    request<AuthResult>('/auth/verify-code', {
      method: 'POST',
      body: { phone, code, ...(name ? { name } : {}) },
    }),

  guest: () => request<GuestResult>('/auth/guest', { method: 'POST', authenticated: false }),
};

export interface RestaurantQuery {
  lat?: number;
  lng?: number;
  sort?: 'recommended' | 'nearest' | 'fastest' | 'top_rated';
  distMax?: number;
  minRating?: number;
  category?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export const catalog = {
  categories: (language?: string) =>
    request<{ items: Category[] }>('/categories', { authenticated: false, language }),

  restaurants: (query: RestaurantQuery = {}, language?: string) =>
    request<Paged<RestaurantListItem>>('/restaurants', {
      query: query as Record<string, string | number | undefined>,
      authenticated: false,
      language,
    }),

  restaurant: (idOrSlug: string, language?: string) =>
    request<RestaurantDetail>(`/restaurants/${idOrSlug}`, { authenticated: false, language }),

  menu: (idOrSlug: string, menuTab?: string, language?: string) =>
    request<{ items: MenuItem[] }>(`/restaurants/${idOrSlug}/menu`, {
      query: { menuTab },
      authenticated: false,
      language,
    }),
};
