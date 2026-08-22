/**
 * Dev seed — what the staff have been doing.
 *
 * `audit_log` is written by the services as changes happen, which means a fresh
 * database has an empty one and the People screen's activity panel has nothing
 * to render. Every sentence that panel can build — a price change, a dish taken
 * off the menu, a branch closed, a role revoked, an impersonated edit — is
 * unreachable until somebody spends an afternoon clicking through the back
 * office. That is how "it works on my database" happens.
 *
 * The order half of the feed needs nothing here: `seed-orders.ts` already writes
 * `order_events` with staff actors, so the merge has both sides as soon as this
 * fills in the other one.
 *
 * **Entries are made true, not just written.** The dish this claims was taken
 * off the menu really is soft-deleted, and the branch this says was closed
 * really is closed. A seeded audit trail that describes changes the database
 * does not reflect is worse than an empty one — the whole value of this table is
 * that it can be believed.
 *
 * Deterministic, like the rest of the seed: ids and choices come from a hash of
 * a stable key, never from `Math.random`. "Random-looking" and "different every
 * run" are not the same thing, and the second makes a bug found this morning
 * unreproducible this afternoon.
 *
 * Idempotent: every row's primary key is derived from what it describes, so a
 * re-run computes exactly the same ids, replaces exactly its own rows, and
 * cannot touch an entry the running application wrote.
 */
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AUDIT_ACTION_ENTITY, AuditAction, StaffRole } from '@amragrir/shared';

/**
 * A stable id for a seeded row.
 *
 * Derived from what the entry is about rather than generated, which is the
 * whole idempotency strategy: the same entry computes the same uuid on every
 * run, so `createMany({ skipDuplicates: true })` inserts it once and silently
 * skips it forever after. Postgres does not check the version nibble, but this
 * shapes one anyway so the values look like what they are sitting next to.
 */
export function seededId(key: string): string {
  const hex = createHash('sha1').update(`activity:${key}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * When this entry happened — somewhere in the last three weeks, always past.
 *
 * `daysBack` is a phase rather than a target: it rotates each kind of action to
 * a different part of the window so the kinds interleave. Real activity is
 * mixed, and a demo whose first page is eight consecutive `menu_item.delete`
 * rows is a demo of the wrong screen.
 *
 * Derived from the key rather than randomised, so the timeline is the same shape
 * on every machine and on every re-run.
 */
export function momentFor(key: string, daysBack: number): Date {
  // Wrapped into a three-week window rather than jittered around `daysBack` and
  // clamped. Two failure modes this avoids, both of which make a bad demo:
  //
  // - Too little spread and every entry of a kind lands in one slice, so the
  //   newest page is twenty-five deletions in a row (the demo restaurant admin
  //   administers all 25 seeded restaurants).
  // - Enough spread to interleave, but clamped at "now", and every entry whose
  //   jitter went negative piles up on the boundary at the same instant.
  //
  // Wrapping keeps the distribution even and lets `daysBack` do what it is
  // actually for: rotating each kind of action to a different phase of the
  // window, so they interleave instead of stacking.
  //
  // The offset comes from a digest rather than `stableHash`, whose low bits
  // barely move between similar keys: `soldout:<id>` and `backon:<id>` differ
  // only by a prefix, and taking that hash modulo the window put a whole seed's
  // worth of entries into four distinct days.
  const window = 21 * 24 * 60;
  const spread = parseInt(createHash('sha1').update(`when:${key}`).digest('hex').slice(0, 8), 16);
  const minutes = 30 + ((daysBack * 24 * 60 + spread) % window);
  return new Date(Date.now() - minutes * 60_000);
}

/**
 * The same moments, handed back in causal order.
 *
 * `momentFor` wraps into the window, so the order of two entries is whatever
 * their digests happened to produce — fine for entries about different things,
 * and wrong for a chain about one dish. A dish that is marked sold out, then
 * added to the menu, then put back on sale is not a history; it is three rows
 * that cannot all be true.
 *
 * This never showed while `audit_log` was only read per person, because the
 * creation is the admin's row and the flips are the shift's, on two different
 * screens. `GET /restaurant/menu-items/{id}/history` puts them side by side, and
 * a demo whose first timeline reads backwards is a demo of nothing.
 *
 * The instants are reused rather than recomputed, so the feed's spread is
 * exactly what it was — the same set of times, assigned in the order the events
 * actually happen in. Ties keep the caller's order, `sort` being stable.
 */
export function inOrder(moments: Date[]): Date[] {
  return [...moments].sort((a, b) => a.getTime() - b.getTime());
}

interface Person {
  id: string;
  name: string;
  email: string;
}

export async function seedActivity(prisma: PrismaClient): Promise<void> {
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      slug: true,
      branches: {
        select: { id: true, name: true, city: true, isOpen: true, avgPrepMin: true, phone: true },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const superAdmin = await prisma.staffUser.findFirst({
    where: { assignments: { some: { role: StaffRole.SuperAdmin } } },
    select: { id: true, name: true, email: true },
  });

  const rows: Prisma.AuditLogCreateManyInput[] = [];
  /** Menu items to actually soft-delete, so the `menu_item.delete` entries
   *  describe something that really happened. */
  const toDelete: { id: string; at: Date }[] = [];
  /** Branches to actually close, for the same reason. */
  const toClose: string[] = [];

  for (const restaurant of restaurants) {
    // Who works here, as the panel would list them. The restaurant's own admin
    // makes the changes that outlive a shift; the branch's people make the ones
    // that do not.
    const admin = await pickHolder(prisma, {
      role: StaffRole.RestaurantAdmin,
      restaurantId: restaurant.id,
    });
    if (!admin) {
      continue;
    }

    for (const [branchIndex, branch] of restaurant.branches.entries()) {
      const manager = await pickHolder(prisma, {
        role: StaffRole.RestaurantManager,
        branchId: branch.id,
      });
      const shift = await pickHolder(prisma, {
        role: StaffRole.BranchStaff,
        branchId: branch.id,
      });

      const scope = { restaurantId: restaurant.id, branchId: branch.id };
      // Deliberately *not* filtered to the live menu. Filtering would make the
      // list shift as soon as this seed deletes something: the next run would
      // pick a different dish to delete, write a new entry for it, and eat one
      // more dish per restaurant every time it ran. Reading every dish keeps the
      // choice fixed, so a re-run recomputes exactly the same ids and changes
      // nothing. An entry describing a dish that is now gone is correct anyway —
      // it was on the menu when the change it records happened.
      const dishes = await prisma.menuItem.findMany({
        where: { branchId: branch.id },
        select: { id: true, nameI18n: true, priceAmd: true, sectionId: true, isAvailable: true },
        orderBy: [{ priceAmd: 'asc' }, { id: 'asc' }],
        take: 6,
      });

      // ── the admin's week: prices, dishes, the branch's standing details ────

      const [cheapest, second, third, fourth] = dishes;

      // The cheapest dish carries three of the entries below — added to the
      // menu, marked sold out, put back on sale — and they are a chain, not
      // three independent facts. Their moments are therefore sorted rather than
      // left to whatever `momentFor`'s digests produced: a dish sold out before
      // it was created is not a history. The two flips are only written when
      // there is a shift to write them, so only then are they in the chain.
      const [addedAt, soldOutAt, backOnAt] = cheapest
        ? inOrder([
            momentFor(`create:${cheapest.id}`, 19),
            ...(shift
              ? [momentFor(`soldout:${cheapest.id}`, 2), momentFor(`backon:${cheapest.id}`, 1)]
              : []),
          ])
        : [];

      if (cheapest) {
        rows.push({
          id: seededId(`create:${cheapest.id}`),
          ...actor(admin),
          ...entry(AuditAction.MenuItemCreate),
          entityId: cheapest.id,
          ...scope,
          after: {
            nameI18n: cheapest.nameI18n as Prisma.InputJsonValue,
            priceAmd: cheapest.priceAmd,
            sectionId: cheapest.sectionId,
          },
          createdAt: addedAt,
        });
      }

      if (second) {
        // The entry this whole feature gets opened for. `before` carries the
        // name as well as the old price, so the panel can say which dish moved
        // without a second request.
        const was = Math.round(second.priceAmd * 0.88);
        rows.push({
          id: seededId(`price:${second.id}`),
          ...actor(admin),
          ...entry(AuditAction.MenuItemUpdate),
          entityId: second.id,
          ...scope,
          before: { nameI18n: second.nameI18n as Prisma.InputJsonValue, priceAmd: was },
          after: { priceAmd: second.priceAmd },
          createdAt: momentFor(`price:${second.id}`, 6),
        });
      }

      if (third) {
        rows.push({
          id: seededId(`edit:${third.id}`),
          ...actor(admin),
          ...entry(AuditAction.MenuItemUpdate),
          entityId: third.id,
          ...scope,
          before: { nameI18n: third.nameI18n as Prisma.InputJsonValue, prepMin: 12 },
          after: { prepMin: 18 },
          createdAt: momentFor(`edit:${third.id}`, 11),
        });
      }

      // One dish per restaurant actually leaves the menu, so the delete entry
      // is true and the soft delete is visible on the Menu screen too.
      if (branchIndex === 0 && fourth) {
        const at = momentFor(`delete:${fourth.id}`, 4);
        toDelete.push({ id: fourth.id, at });
        rows.push({
          id: seededId(`delete:${fourth.id}`),
          ...actor(admin),
          ...entry(AuditAction.MenuItemDelete),
          entityId: fourth.id,
          ...scope,
          // The only remaining record of what it was called, once every read
          // path has filtered it out.
          before: {
            nameI18n: fourth.nameI18n as Prisma.InputJsonValue,
            priceAmd: fourth.priceAmd,
          },
          createdAt: at,
        });
      }

      rows.push({
        id: seededId(`branch-phone:${branch.id}`),
        ...actor(admin),
        ...entry(AuditAction.BranchUpdate),
        entityId: branch.id,
        ...scope,
        before: { phone: branch.phone },
        after: { phone: '+374 10 555 019' },
        createdAt: momentFor(`branch-phone:${branch.id}`, 14),
      });

      // ── the shift's day: the one menu change they may make ────────────────

      if (shift && cheapest) {
        rows.push({
          id: seededId(`soldout:${cheapest.id}`),
          ...actor(shift),
          ...entry(AuditAction.MenuItemAvailability),
          entityId: cheapest.id,
          ...scope,
          before: { nameI18n: cheapest.nameI18n as Prisma.InputJsonValue, isAvailable: true },
          after: { isAvailable: false },
          createdAt: soldOutAt,
        });
        rows.push({
          id: seededId(`backon:${cheapest.id}`),
          ...actor(shift),
          ...entry(AuditAction.MenuItemAvailability),
          entityId: cheapest.id,
          ...scope,
          before: { nameI18n: cheapest.nameI18n as Prisma.InputJsonValue, isAvailable: false },
          after: { isAvailable: true },
          createdAt: backOnAt,
        });
      }

      // ── the manager's shift: the room itself ──────────────────────────────

      if (manager) {
        rows.push({
          id: seededId(`prep:${branch.id}`),
          ...actor(manager),
          ...entry(AuditAction.BranchStatus),
          entityId: branch.id,
          ...scope,
          before: { avgPrepMin: branch.avgPrepMin },
          after: { avgPrepMin: 25 },
          createdAt: momentFor(`prep:${branch.id}`, 3),
        });

        // Every fourth branch is shut, and actually shut — a kitchen that stops
        // taking orders is the thing this switch is for.
        if (stableHash(branch.id) % 4 === 0) {
          toClose.push(branch.id);
          rows.push({
            id: seededId(`closed:${branch.id}`),
            ...actor(manager),
            ...entry(AuditAction.BranchStatus),
            entityId: branch.id,
            ...scope,
            before: { isOpen: true },
            after: { isOpen: false },
            createdAt: momentFor(`closed:${branch.id}`, 1),
          });
        }

        // The line nothing else in dev produces: a change made by the super
        // admin while signed in as somebody else. It is filed against the
        // account acted as, and names the person really at the keyboard.
        if (superAdmin && branchIndex === 0 && second) {
          rows.push({
            id: seededId(`acting:${branch.id}`),
            actorStaffId: manager.id,
            actingStaffId: superAdmin.id,
            ...entry(AuditAction.MenuItemAvailability),
            entityId: second.id,
            ...scope,
            before: { nameI18n: second.nameI18n as Prisma.InputJsonValue, isAvailable: true },
            after: { isAvailable: false },
            createdAt: momentFor(`acting:${branch.id}`, 5),
          });
        }
      }
    }

    // ── hiring, at the restaurant level ──────────────────────────────────────

    rows.push({
      id: seededId(`invite:${restaurant.id}`),
      ...actor(admin),
      ...entry(AuditAction.StaffInvite),
      entityId: seededId(`invite-row:${restaurant.id}`),
      restaurantId: restaurant.id,
      branchId: null,
      after: {
        email: `new.hire@${restaurant.slug}.amragrir.local`,
        role: StaffRole.BranchStaff,
        granted: false,
      },
      createdAt: momentFor(`invite:${restaurant.id}`, 9),
    });

    rows.push({
      id: seededId(`withdraw:${restaurant.id}`),
      ...actor(admin),
      ...entry(AuditAction.StaffInviteRevoke),
      entityId: seededId(`withdraw-row:${restaurant.id}`),
      restaurantId: restaurant.id,
      branchId: null,
      before: {
        email: `wrong.address@${restaurant.slug}.amragrir.local`,
        role: StaffRole.BranchStaff,
      },
      createdAt: momentFor(`withdraw:${restaurant.id}`, 8),
    });

    // A revoked role is hard-deleted, so `before` is the only thing that will
    // ever say which role over which scope — this is the entry that proves it.
    const firstBranch = restaurant.branches[0];
    if (firstBranch) {
      rows.push({
        id: seededId(`revoke:${restaurant.id}`),
        ...actor(admin),
        ...entry(AuditAction.StaffAssignmentRevoke),
        entityId: seededId(`revoke-row:${restaurant.id}`),
        restaurantId: null,
        branchId: firstBranch.id,
        before: {
          role: StaffRole.BranchStaff,
          name: 'Seasonal Hire',
          email: `seasonal@${restaurant.slug}.amragrir.local`,
        },
        createdAt: momentFor(`revoke:${restaurant.id}`, 13),
      });
    }
  }

  // ── the platform's own row ────────────────────────────────────────────────

  if (superAdmin) {
    const target = await prisma.staffUser.findFirst({
      where: { id: { not: superAdmin.id }, assignments: { some: {} } },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });
    if (target) {
      // No scope on either column, which is what keeps this row readable only by
      // an account whose reach is unscoped. A restaurant admin must not learn
      // that the platform signed in as one of their people.
      rows.push({
        id: seededId(`impersonate:${target.id}`),
        actorStaffId: superAdmin.id,
        actingStaffId: null,
        ...entry(AuditAction.StaffImpersonate),
        entityId: target.id,
        restaurantId: null,
        branchId: null,
        after: { email: target.email, roles: [] },
        ip: '10.0.0.1',
        createdAt: momentFor(`impersonate:${target.id}`, 7),
      });
    }
  }

  // Replaced rather than skipped, and only ever *its own* rows: every id here
  // comes out of `seededId`, so this cannot touch an entry the running app
  // wrote. `skipDuplicates` alone would pin the seeded timeline to whatever
  // shape the first run happened to give it — change the spread or add an
  // action, and a re-run would silently keep the old rows.
  const ids = rows.map((row) => row.id as string);
  const replaced = await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
  const written = await prisma.auditLog.createMany({ data: rows });

  // The changes the entries describe, applied only where they have not been —
  // so a re-run does not re-stamp a `deleted_at` that is already set, and the
  // counts below report what actually moved rather than what was intended.
  let deleted = 0;
  for (const dish of toDelete) {
    const { count } = await prisma.menuItem.updateMany({
      where: { id: dish.id, deletedAt: null },
      data: { deletedAt: dish.at },
    });
    deleted += count;
  }

  const closed =
    toClose.length === 0
      ? 0
      : (
          await prisma.restaurantBranch.updateMany({
            where: { id: { in: toClose }, isOpen: true },
            data: { isOpen: false },
          })
        ).count;

  console.log(
    `Activity seed: ${written.count} audit entries (${written.count - replaced.count} new), ` +
      `${deleted} dishes taken off the menu, ${closed} branches closed`,
  );
}

/** The actor columns for an ordinary (non-impersonated) action. */
function actor(person: Person): { actorStaffId: string; actingStaffId: null } {
  return { actorStaffId: person.id, actingStaffId: null };
}

/** The action and the entity it implies — derived through the same map the API
 *  writes through, so seeded rows cannot disagree with real ones. */
function entry(action: AuditAction): { action: AuditAction; entity: string } {
  return { action, entity: AUDIT_ACTION_ENTITY[action] };
}

/** Somebody holding this role over this scope, or null where the seed did not
 *  staff it. Ordered, so the same person is picked on every run. */
async function pickHolder(
  prisma: PrismaClient,
  where: Prisma.StaffAssignmentWhereInput,
): Promise<Person | null> {
  const assignment = await prisma.staffAssignment.findFirst({
    where: { ...where, staffUser: { isActive: true } },
    select: { staffUser: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return assignment?.staffUser ?? null;
}
