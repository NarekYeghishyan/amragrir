import type { MenuTab, OrderStatus, PaymentStatus } from '@amragrir/shared';

const BASE = __API_URL__;

const ACCESS_KEY = 'amragrir.admin.access';
const REFRESH_KEY = 'amragrir.admin.refresh';

/**
 * Tokens are kept in `localStorage`.
 *
 * The honest trade-off: this is reachable by any script that ends up on the
 * page, where an httpOnly cookie would not be. It is accepted here because
 * this is an internal tool with no third-party embeds, and because the
 * alternative needs cookie auth on the API. **Revisit before this is exposed
 * beyond the restaurant's own network** — noted in the README too.
 *
 * Persisting at all is not optional: access tokens last 15 minutes and a
 * kitchen panel stays open all shift, so a panel that forgot its session on
 * every refresh would be unusable.
 */
export const tokens = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
  authenticated?: boolean;
}

/**
 * One refresh at a time.
 *
 * Refresh tokens are single-use and rotated (API_DOCUMENTATION.md), so two
 * requests expiring together would each try to spend the same token and the
 * loser would be logged out. Everyone waits on the same promise instead.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const token = tokens.refresh;
    if (!token) {
      return false;
    }
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!res.ok) {
        tokens.clear();
        return false;
      }
      const pair = (await res.json()) as { accessToken: string; refreshToken: string };
      tokens.set(pair.accessToken, pair.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

async function send<T>(path: string, options: Options, retry: boolean): Promise<T> {
  const { method = 'GET', body, query, authenticated = true } = options;

  const url = new URL(`${BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (authenticated && tokens.access) {
    headers.Authorization = `Bearer ${tokens.access}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the API');
  }

  // An expired access token is the normal state of a panel left open, not an
  // error worth showing anyone — refresh once and repeat the request.
  if (response.status === 401 && retry && authenticated) {
    if (await refreshSession()) {
      return send<T>(path, options, false);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = payload as { error?: { code: string; message: string; details?: unknown } };
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed with ${response.status}`,
      envelope?.error?.details,
    );
  }

  return payload as T;
}

export function request<T>(path: string, options: Options = {}): Promise<T> {
  return send<T>(path, options, true);
}

export function streamUrl(): string {
  return `${BASE.replace(/^http/, 'ws')}/orders/stream`;
}

// ── shapes ──────────────────────────────────────────────────────────────────

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; name: string | null; role: string; phone: string | null };
}

export interface OwnerOrder {
  id: string;
  code: string;
  pickupCode: string;
  status: OrderStatus;
  serviceMode: string;
  branch: { id: string; name: string | null };
  customerName: string | null;
  itemsCount: number;
  totalAmd: number;
  paymentStatus: PaymentStatus | null;
  readyAt: string | null;
  secondsLeft: number | null;
  createdAt: string;
  items: { name: string; qty: number }[];
  notes: string | null;
}

export interface OwnerBranch {
  id: string;
  restaurantId: string;
  restaurantName: string;
  name: string | null;
  address: string | null;
  city: string;
  phone: string | null;
  isOpen: boolean;
  avgPrepMin: number | null;
  menuItemCount: number;
}

export interface OwnerMenuItem {
  id: string;
  branchId: string;
  categoryId: string | null;
  menuTab: MenuTab;
  nameI18n: Record<string, string>;
  descI18n: Record<string, string> | null;
  priceAmd: number;
  caloriesKcal: number | null;
  prepMin: number | null;
  photoUrl: string | null;
  dietaryTags: string[];
  isAvailable: boolean;
}

// ── endpoints ───────────────────────────────────────────────────────────────

export const api = {
  sendCode: (phone: string) =>
    request<{ sent: true; expiresIn: number }>('/auth/send-code', {
      method: 'POST',
      body: { phone },
      authenticated: false,
    }),

  verifyCode: (phone: string, code: string) =>
    request<AuthResult>('/auth/verify-code', {
      method: 'POST',
      body: { phone, code },
      authenticated: false,
    }),

  me: () => request<{ id: string; name: string | null; role: string }>('/me'),

  orders: (status: 'active' | 'past') =>
    request<{ items: OwnerOrder[]; total: number }>('/owner/orders', { query: { status } }),

  setOrderStatus: (id: string, status: OrderStatus) =>
    request<unknown>(`/owner/orders/${id}/status`, { method: 'PATCH', body: { status } }),

  branches: () => request<{ items: OwnerBranch[] }>('/owner/branches'),

  updateBranch: (id: string, patch: { isOpen?: boolean; avgPrepMin?: number }) =>
    request<OwnerBranch>(`/owner/branches/${id}`, { method: 'PATCH', body: patch }),

  menu: (branchId: string) =>
    request<{ items: OwnerMenuItem[] }>('/owner/menu-items', { query: { branchId } }),

  createMenuItem: (item: {
    branchId: string;
    menuTab: MenuTab;
    nameI18n: Record<string, string>;
    priceAmd: number;
    prepMin?: number;
  }) => request<OwnerMenuItem>('/owner/menu-items', { method: 'POST', body: item }),

  updateMenuItem: (id: string, patch: Partial<{ priceAmd: number; isAvailable: boolean }>) =>
    request<OwnerMenuItem>(`/owner/menu-items/${id}`, { method: 'PATCH', body: patch }),

  deleteMenuItem: (id: string) => request<void>(`/owner/menu-items/${id}`, { method: 'DELETE' }),
};
