// What a staff member can be recorded as having done — see docs/ROLES_AND_PERMISSIONS.md
// ("What is recorded") and docs/DATABASE.md §19.
//
// The vocabulary lives here rather than as string literals at each call site for
// the same reason the statuses do: the API writes these, the back office renders
// a sentence per value in three languages, and a typo on either side would be a
// silently unreadable row rather than a compile error.

/**
 * The verbs. `resource.verb`, stored in `audit_log.action`.
 *
 * Ordered by resource. Adding one is a code change in three places on purpose —
 * here, at the call site that writes it, and in the i18n bundles that give it a
 * sentence — because an action nobody can read is an action nobody logged.
 *
 * **Order status changes are deliberately absent.** They live in `order_events`,
 * which records the customer and the payment provider too; folding them in here
 * would mean a staff-only actor column against rows whose actor is usually not
 * staff. The activity feed reads both tables and merges them — see
 * `StaffActivityService`.
 */
export const AuditAction = {
  /** A dish added to a branch's menu. */
  MenuItemCreate: 'menu_item.create',
  /** Any edit to the dish itself — name, description, category, and price.
   *  `before`/`after` carry only the fields that actually changed, so a price
   *  change is this action with `price_amd` in both. */
  MenuItemUpdate: 'menu_item.update',
  /** Sold out and back, on the narrower `menu:availability` permission. Separate
   *  from `update` because a shift may do this and may not do that, and a feed
   *  that could not tell them apart would make every shift look like an editor. */
  MenuItemAvailability: 'menu_item.availability',
  /** Off the menu. A soft delete — the row survives, so `entity_id` still
   *  resolves and the dish can still be named. */
  MenuItemDelete: 'menu_item.delete',

  BranchCreate: 'branch.create',
  BranchUpdate: 'branch.update',
  /** Open/closed and the prep estimate — the shift's own switch, on
   *  `branch:hours` rather than `branch:write`. */
  BranchStatus: 'branch.status',

  /** An invitation sent, or a role granted outright to an account that already
   *  existed. `after.granted` tells the two apart. */
  StaffInvite: 'staff.invite',
  /** An invitation withdrawn before it was accepted. */
  StaffInviteRevoke: 'staff.invite_revoke',
  /** A role taken away. The row is hard-deleted — a revoked role must be gone
   *  from the permission path, not filtered out of it — so `before` is the only
   *  remaining record of which role over which scope. */
  StaffAssignmentRevoke: 'staff.assignment_revoke',
  /** Signing in as somebody else. The oldest writer of this table. */
  StaffImpersonate: 'staff.impersonate',

  /** A diner's full phone number, read off the Customers screen. The list shows
   *  every number masked; this is the one action that unmasks one, which is why
   *  it is the one *read* in this table of writes. Nothing changed, so there is
   *  no `before`/`after` — the row itself is the fact worth keeping. */
  CustomerPhoneView: 'customer.phone_view',

  /** Seated, completed, no-showed. */
  ReservationStatus: 'reservation.status',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Which table `entity_id` points into.
 *
 * Kept separate from the action rather than derived by splitting on the dot:
 * `staff.invite` writes a `staff_invites` row and `staff.assignment_revoke` a
 * `staff_assignments` one, so the prefix names the area, not the table.
 */
export const AuditEntity = {
  MenuItem: 'menu_item',
  Branch: 'branch',
  StaffUser: 'staff_user',
  StaffInvite: 'staff_invite',
  StaffAssignment: 'staff_assignment',
  /** A `users` row — a diner, not a staff account. The only entity here that
   *  belongs to the other identity, and it is here because reading a phone
   *  number is a thing staff do *to* a customer record. */
  Customer: 'customer',
  Reservation: 'reservation',
} as const;
export type AuditEntity = (typeof AuditEntity)[keyof typeof AuditEntity];

/**
 * Which entity each action is about, so a writer cannot pair a menu action with
 * a staff entity. The one place the two vocabularies are related.
 */
export const AUDIT_ACTION_ENTITY: Readonly<Record<AuditAction, AuditEntity>> = {
  [AuditAction.MenuItemCreate]: AuditEntity.MenuItem,
  [AuditAction.MenuItemUpdate]: AuditEntity.MenuItem,
  [AuditAction.MenuItemAvailability]: AuditEntity.MenuItem,
  [AuditAction.MenuItemDelete]: AuditEntity.MenuItem,
  [AuditAction.BranchCreate]: AuditEntity.Branch,
  [AuditAction.BranchUpdate]: AuditEntity.Branch,
  [AuditAction.BranchStatus]: AuditEntity.Branch,
  [AuditAction.StaffInvite]: AuditEntity.StaffInvite,
  [AuditAction.StaffInviteRevoke]: AuditEntity.StaffInvite,
  [AuditAction.StaffAssignmentRevoke]: AuditEntity.StaffAssignment,
  [AuditAction.StaffImpersonate]: AuditEntity.StaffUser,
  [AuditAction.CustomerPhoneView]: AuditEntity.Customer,
  [AuditAction.ReservationStatus]: AuditEntity.Reservation,
} as const;

/**
 * What one entry in a person's activity feed is, whichever table it came from.
 *
 * The feed merges `audit_log` and `order_events`, which do not have the same
 * shape and should not be forced into one: `kind` says which, and the panel
 * renders a different sentence for each. An `order` entry has statuses and no
 * `action`; an `audit` entry has an action and `before`/`after`.
 */
export const ActivityKind = {
  Audit: 'audit',
  Order: 'order',
} as const;
export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];
