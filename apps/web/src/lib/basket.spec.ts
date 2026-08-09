import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Language, ServiceMode } from '@amragrir/shared';
import { ApiError } from './api';
import { loadBasket } from './basket';

/**
 * What the basket screens are handed when the API will not price a basket.
 *
 * The three outcomes are the whole point of this module: a customer whose
 * table booking has been cancelled met an error page on `/cart` and had no way
 * off it, because the cookie behind it is httpOnly and the screen that clears
 * it was the one failing. These are the rules that stop that happening again,
 * so they are checked without a browser or a server in the way.
 */

const CART = {
  branchId: '8dac3a8c-cf8f-4451-a616-345db020dbb2',
  slug: 'dolmama',
  serviceMode: ServiceMode.Pickup,
  items: [{ menuItemId: 'd6fef7c0-b93b-43d0-be1f-c4c03c1decd7', qty: 1 }],
  nonce: '11111111-1111-4111-8111-111111111111',
};

const SESSION = { accessToken: 'a', refreshToken: 'r', verified: false };

const readCart = vi.fn();
const readSession = vi.fn();
const quote = vi.fn();

vi.mock('./cart-store', () => ({ readCart: () => readCart() }));
vi.mock('./session', () => ({ readSession: () => readSession() }));
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, api: { quote: (...args: unknown[]) => quote(...args) } };
});
// The real one throws to unwind the render; this keeps that shape so a test can
// tell a redirect apart from a returned state.
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));

const load = () => loadBasket(Language.Hy, '/cart');

beforeEach(() => {
  vi.clearAllMocks();
  readCart.mockResolvedValue(CART);
  readSession.mockResolvedValue(SESSION);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadBasket', () => {
  it('prices a basket that the API accepts', async () => {
    quote.mockResolvedValue({ prepMin: 0 });

    await expect(load()).resolves.toMatchObject({ kind: 'priced', cart: CART });
  });

  it.each([
    ['a basket cookie that is not there', null],
    ['a basket with no lines left in it', { ...CART, items: [] }],
  ])('reports %s as empty', async (_case, cart) => {
    readCart.mockResolvedValue(cart);

    await expect(load()).resolves.toEqual({ kind: 'empty' });
  });

  it.each([
    ['the branch has been withdrawn', 404, 'Restaurant not found'],
    ['the table booking is gone', 404, 'Reservation not found'],
    ['the API refuses the basket outright', 400, 'Each menu item may appear only once'],
    ['a dish can no longer be ordered', 422, 'Some items can no longer be ordered'],
  ])('hands back a stale basket when %s', async (_case, status, message) => {
    quote.mockRejectedValue(new ApiError(status, message));

    await expect(load()).resolves.toEqual({ kind: 'stale', cart: CART, status });
  });

  it('says which refusal it was on the server, and only there', async () => {
    // The page says "start a new basket"; which dish went missing is a
    // developer's question and belongs in the terminal.
    quote.mockRejectedValue(new ApiError(404, 'Reservation not found'));
    await load();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Reservation not found'));
  });

  it('sends a rejected session to be renewed rather than calling it stale', async () => {
    // A 401 is a token that has run out, not a basket that has: rebuilding the
    // basket would be the one thing that does not fix it.
    quote.mockRejectedValue(new ApiError(401, 'Unauthorized'));

    await expect(load()).rejects.toThrow('REDIRECT /session?next=%2Fcart');
  });

  it('still throws when the API itself breaks', async () => {
    // A 500 is not the basket going out of date, and dressing it up as one
    // would send somebody to rebuild a basket that was never the problem.
    quote.mockRejectedValue(new ApiError(500, 'Internal server error'));

    await expect(load()).rejects.toThrow(ApiError);
  });

  it('does not price a basket for a visitor who has no session yet', async () => {
    readSession.mockResolvedValue(null);

    await expect(load()).rejects.toThrow('REDIRECT');
    expect(quote).not.toHaveBeenCalled();
  });
});
