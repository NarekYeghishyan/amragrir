import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Role, StaffRole } from '@amragrir/shared';
import { TokenService } from '../auth/token.service';
import { StaffTokenService } from './staff-token.service';

/**
 * The two identities share a signing secret, so "a staff token does not work as
 * a customer token, and vice versa" is a property of these two classes rather
 * than of the algorithm. It is the single assumption the whole split rests on,
 * so it is tested directly.
 */
const SECRET = 'test-secret-at-least-16-chars';

function build() {
  const jwt = new JwtService({ secret: SECRET });
  const config = {
    getOrThrow: jest.fn((key: string) => (key === 'JWT_ACCESS_TTL' ? 900 : 2_592_000)),
  };
  const store = new Map<string, string>();
  const redis = {
    setEx: jest.fn((key: string) => {
      store.set(key, '1');
      return Promise.resolve();
    }),
    exists: jest.fn((key: string) => Promise.resolve(store.has(key))),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    deleteByPattern: jest.fn().mockResolvedValue(0),
  };

  return {
    customer: new TokenService(jwt, config as never, redis as never),
    staff: new StaffTokenService(jwt, config as never, redis as never),
  };
}

describe('customer and staff tokens are not interchangeable', () => {
  it('refuses a staff access token on the customer side', async () => {
    const { customer, staff } = build();
    const pair = await staff.issue('staff-1', [
      { role: StaffRole.SuperAdmin, restaurantId: null, branchId: null },
    ]);

    // It verifies cryptographically — same secret — and carries no `role`, so
    // without the explicit check a guard would read `role: undefined` and wave
    // through anything that does not name a role.
    await expect(customer.verifyAccess(pair.accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a customer access token on the staff side', async () => {
    const { customer, staff } = build();
    const pair = await customer.issue({
      sub: 'user-1',
      role: Role.Customer,
      isGuest: false,
      phoneVerified: true,
    });

    await expect(staff.verifyAccess(pair.accessToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a staff refresh token on the customer refresh endpoint', async () => {
    // It has `typ: refresh` and a `jti`, so it passes the shape check; without
    // the `kind` check it would fail later as a missing customer — a 500 where
    // a 401 is the honest answer.
    const { customer, staff } = build();
    const pair = await staff.issue('staff-1', [
      { role: StaffRole.BranchStaff, restaurantId: null, branchId: 'branch-1' },
    ]);

    await expect(customer.consumeRefresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a customer refresh token on the staff refresh endpoint', async () => {
    const { customer, staff } = build();
    const pair = await customer.issue({
      sub: 'user-1',
      role: Role.Customer,
      isGuest: false,
      phoneVerified: true,
    });

    await expect(staff.consumeRefresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a staff refresh token where an access token is expected', async () => {
    const { staff } = build();
    const pair = await staff.issue('staff-1', []);
    await expect(staff.verifyAccess(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('carries the scopes a guard reads, so no join is needed on the hot path', async () => {
    const { staff } = build();
    const scopes = [
      { role: StaffRole.RestaurantManager, restaurantId: null, branchId: 'branch-1' },
      { role: StaffRole.RestaurantManager, restaurantId: null, branchId: 'branch-2' },
    ];
    const pair = await staff.issue('staff-1', scopes);

    const claims = await staff.verifyAccess(pair.accessToken);
    expect(claims.sub).toBe('staff-1');
    expect(claims.scopes).toEqual(scopes);
  });

  it('rotates: a refresh token works once', async () => {
    const { staff } = build();
    const pair = await staff.issue('staff-1', []);

    await expect(staff.consumeRefresh(pair.refreshToken)).resolves.toBe('staff-1');
    await expect(staff.consumeRefresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
