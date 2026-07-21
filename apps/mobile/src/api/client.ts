import Constants from 'expo-constants';

/**
 * Base URL comes from app.json `extra.apiUrl`. On a physical device
 * `localhost` points at the phone, so set it to the dev machine's LAN address
 * before testing off-simulator.
 */
const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000/v1';

/** The envelope every endpoint returns on failure (API_DOCUMENTATION.md). */
interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

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

  /** True when the caller should re-authenticate rather than retry. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  language?: string;
  /** Send the stored bearer. Default true; the auth endpoints opt out. */
  authenticated?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Single place that talks to the API, so the error envelope is decoded once
 * and screens deal in typed values and `ApiError` rather than raw responses.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, language, authenticated = true } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (language) {
    headers['Accept-Language'] = language;
  }
  if (authenticated && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    // fetch only rejects on transport failure; surface it as an ApiError so
    // screens have exactly one error type to handle.
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server', cause);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = payload as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed with ${response.status}`,
      envelope?.error?.details,
    );
  }

  return payload as T;
}
