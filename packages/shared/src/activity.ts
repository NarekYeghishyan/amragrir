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

  /** A heading added to a branch's menu. */
  MenuSectionCreate: 'menu_section.create',
  /** Renamed, reordered, or pointed at a different platform category — the last
   *  of which quietly moves every dish under it from one chip to another, which
   *  is why the category is in `before`/`after` and not merely the name. */
  MenuSectionUpdate: 'menu_section.update',
  /** A heading removed. Hard-deleted, and only ever when empty: the dishes are
   *  moved first or the delete is refused, so `before` is the only record of
   *  what it was called. */
  MenuSectionDelete: 'menu_section.delete',

  /**
   * The platform's category vocabulary — the chips every guest browses by.
   *
   * Filed here rather than left unrecorded because it is the rare edit with no
   * restaurant to answer for it: one person changes what the whole catalogue is
   * indexed by, and `categories:write` is held by exactly the seat that answers
   * to nobody. The entry is the only thing that can say who.
   */
  CategoryCreate: 'category.create',
  CategoryUpdate: 'category.update',
  /** A category taken off the rail. `after.isActive: false` is a retirement —
   *  the row and its dishes survive; a genuine delete is only possible while
   *  nothing points at it, and then `before` is what it was. */
  CategoryDelete: 'category.delete',

  /**
   * The ways a restaurant says it will feed people — pickup, the eat-in
   * sub-option under it, table service, table booking.
   *
   * Its own action rather than a `restaurant.update` carrying one field,
   * because it is the only thing about a restaurant this panel can change and
   * because of what changing it does: turning table service on withdraws the
   * eat-in option, and a guest who could sit down with their own tray this
   * morning cannot this afternoon. `before`/`after` carry the whole array, not
   * a diff — a set of four values is shorter read whole than as a delta.
   */
  RestaurantServices: 'restaurant.services',

  /**
   * The photograph on the restaurant's card, replaced or taken down.
   *
   * `before`/`after` carry the URLs. Storing them is what makes the entry
   * answer "which picture was this before somebody changed it" — the file the
   * old URL points at is still on disk, because an upload is never deleted when
   * it stops being referenced, so the previous cover is recoverable from this
   * row alone. Taking one down is the same action with `null` in `after`,
   * rather than a `restaurant.cover_delete` nobody would think to look for.
   */
  RestaurantCover: 'restaurant.cover',

  BranchCreate: 'branch.create',
  BranchUpdate: 'branch.update',

  /**
   * This branch's own cover, set, replaced or handed back to the restaurant.
   *
   * Separate from `restaurant.cover` because they are different decisions by
   * different people: one is what the business looks like, the other what this
   * address looks like, and a manager may do the second and not the first.
   * `after.coverUrl: null` is "wear the restaurant's again", not "no picture".
   */
  BranchCover: 'branch.cover',

  /**
   * What this branch offers, or its return to following the restaurant.
   *
   * `after.servicesOverridden: false` is the branch giving the question back to
   * the business — which is a different event from declaring the same set the
   * business happens to declare, and the flag is what keeps the two readable
   * apart a year later.
   */
  BranchServices: 'branch.services',

  /** Whether this branch takes table bookings, or follows the restaurant.
   *  Recorded apart from `branch.services` even though `reserve` lives there:
   *  they are two columns and either can move without the other. */
  BranchBookings: 'branch.bookings',
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

  /**
   * A booking moved to a different table by hand.
   *
   * Apart from `reservation.status` because it is a different decision: the
   * guest is still coming and the deposit is untouched, somebody has just put
   * them somewhere else. `before`/`after` carry the table numbers rather than
   * the ids — a year later "moved from 4 to 11" is readable and a pair of UUIDs
   * is not.
   */
  ReservationTable: 'reservation.table',

  /** A table added to a branch's room. */
  TableCreate: 'table.create',
  /** Its number, seats or zone changed. */
  TableUpdate: 'table.update',
  /**
   * A table taken out of use. A soft delete — `is_active` goes false and the
   * row survives, so bookings that already name it still resolve.
   */
  TableDelete: 'table.delete',

  /**
   * When this branch takes bookings, as opposed to when it serves food.
   *
   * `after.bookingHours: null` is the branch handing the question back to its
   * opening hours, which is a different event from writing hours that happen to
   * match them — and the null is what keeps the two readable apart later.
   */
  BranchBookingHours: 'branch.booking_hours',

  /** A day marked shut, or put on different hours. */
  BranchClosureCreate: 'branch.closure_create',
  /** That day handed back to the ordinary week. */
  BranchClosureDelete: 'branch.closure_delete',

  /**
   * Booking rules changed, at a branch or across a restaurant.
   *
   * One action for both levels, with `scope` saying which — the fields are the
   * same fields and the decision is the same decision. `after` carrying `null`
   * for a field is that level giving the question back up the chain, which is
   * emphatically not the same as setting it to the value it would inherit.
   */
  BookingPolicy: 'booking_policy.update',
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
  /** A `branch_menu_sections` row — one heading of one branch's menu. */
  MenuSection: 'menu_section',
  /** A `categories` row. The only entity here that belongs to no restaurant:
   *  the vocabulary is the platform's. */
  Category: 'category',
  Restaurant: 'restaurant',
  Branch: 'branch',
  StaffUser: 'staff_user',
  StaffInvite: 'staff_invite',
  StaffAssignment: 'staff_assignment',
  /** A `users` row — a diner, not a staff account. The only entity here that
   *  belongs to the other identity, and it is here because reading a phone
   *  number is a thing staff do *to* a customer record. */
  Customer: 'customer',
  Reservation: 'reservation',
  Table: 'table',
  BranchClosure: 'branch_closure',
  BookingPolicy: 'booking_policy',
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
  [AuditAction.MenuSectionCreate]: AuditEntity.MenuSection,
  [AuditAction.MenuSectionUpdate]: AuditEntity.MenuSection,
  [AuditAction.MenuSectionDelete]: AuditEntity.MenuSection,
  [AuditAction.CategoryCreate]: AuditEntity.Category,
  [AuditAction.CategoryUpdate]: AuditEntity.Category,
  [AuditAction.CategoryDelete]: AuditEntity.Category,
  [AuditAction.RestaurantServices]: AuditEntity.Restaurant,
  [AuditAction.RestaurantCover]: AuditEntity.Restaurant,
  [AuditAction.BranchCreate]: AuditEntity.Branch,
  [AuditAction.BranchUpdate]: AuditEntity.Branch,
  [AuditAction.BranchStatus]: AuditEntity.Branch,
  [AuditAction.BranchCover]: AuditEntity.Branch,
  [AuditAction.BranchServices]: AuditEntity.Branch,
  [AuditAction.BranchBookings]: AuditEntity.Branch,
  [AuditAction.StaffInvite]: AuditEntity.StaffInvite,
  [AuditAction.StaffInviteRevoke]: AuditEntity.StaffInvite,
  [AuditAction.StaffAssignmentRevoke]: AuditEntity.StaffAssignment,
  [AuditAction.StaffImpersonate]: AuditEntity.StaffUser,
  [AuditAction.CustomerPhoneView]: AuditEntity.Customer,
  [AuditAction.ReservationStatus]: AuditEntity.Reservation,
  [AuditAction.ReservationTable]: AuditEntity.Reservation,
  [AuditAction.TableCreate]: AuditEntity.Table,
  [AuditAction.TableUpdate]: AuditEntity.Table,
  [AuditAction.TableDelete]: AuditEntity.Table,
  // The hours belong to the branch row, so the entry points at the branch —
  // there is no separate thing to name.
  [AuditAction.BranchBookingHours]: AuditEntity.Branch,
  [AuditAction.BranchClosureCreate]: AuditEntity.BranchClosure,
  [AuditAction.BranchClosureDelete]: AuditEntity.BranchClosure,
  [AuditAction.BookingPolicy]: AuditEntity.BookingPolicy,
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
