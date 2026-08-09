import type {
  BookingPolicyFields,
  BookingPolicyView,
  PolicySource,
  WeeklyHours,
} from './api';

/**
 * The shapes behind the booking-settings section, kept out of the component.
 *
 * Two conversions and a handful of rules, none of which need a DOM to be right:
 * a week of opening hours is stored as a sparse map and edited as seven rows,
 * and a policy field is stored as "a number or null" and edited as "a switch
 * and a number". Both directions are here so the tests can hold them to being
 * inverses of each other — a form that reads a week differently from the way it
 * writes one loses a Sunday every time somebody saves.
 */

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** One row of the weekly editor. Always present for all seven days, even when
 *  the stored document says nothing about most of them. */
export interface DayRow {
  day: Weekday;
  /** False means the branch takes no bookings that day — a real answer, and
   *  not the same as having said nothing. */
  open: boolean;
  from: string;
  to: string;
}

export const DEFAULT_FROM = '10:00';
export const DEFAULT_TO = '23:00';

/**
 * Seven editable rows from whatever the branch has stored.
 *
 * `null` — the branch takes bookings whenever the kitchen is open — comes back
 * as seven rows of the kitchen's own hours rather than as blanks, so switching
 * "decide here" on starts from what is already true and changes nothing by
 * itself. A form that started empty would make that switch a destructive act.
 */
export function draftFromHours(
  hours: WeeklyHours | null,
  fallback: { from: string; to: string } = { from: DEFAULT_FROM, to: DEFAULT_TO },
): DayRow[] {
  return WEEKDAYS.map((day) => {
    const entry = hours?.[day] ?? hours?.default;
    if (!entry) {
      return { day, open: true, from: fallback.from, to: fallback.to };
    }
    if (entry.closed === true) {
      // Keep the times underneath, so a day switched shut and open again comes
      // back as it was rather than as the default.
      return { day, open: false, from: entry.open ?? fallback.from, to: entry.close ?? fallback.to };
    }
    return { day, open: true, from: entry.open ?? fallback.from, to: entry.close ?? fallback.to };
  });
}

/** The rows as the API stores them — every day written out, because a day left
 *  unsaid would fall through to the kitchen's hours and quietly reopen. */
export function hoursFromDraft(rows: readonly DayRow[]): WeeklyHours {
  const hours: WeeklyHours = {};
  for (const row of rows) {
    hours[row.day] = row.open ? { open: row.from, close: row.to } : { closed: true };
  }
  return hours;
}

/** `HH:MM`, 00:00 to 24:00 — the same shape the API validates. */
const HH_MM = /^(?:[01]\d|2[0-4]):[0-5]\d$/;

export function isTime(value: string): boolean {
  return HH_MM.test(value);
}

/**
 * Why these rows cannot be saved, or null.
 *
 * Only the shape is checked. A closing time at or before the opening one is
 * **not** an error: that is how a night that runs past midnight is written, and
 * refusing it here would make a late-night restaurant unable to describe
 * itself.
 */
export function hoursProblem(rows: readonly DayRow[]): Weekday | null {
  for (const row of rows) {
    if (row.open && (!isTime(row.from) || !isTime(row.to))) {
      return row.day;
    }
  }
  return null;
}

/** Whether a day's window runs past midnight — what the row says out loud, so
 *  "22:00–02:00" does not read as a mistake somebody should fix. */
export function runsPastMidnight(row: DayRow): boolean {
  return row.open && isTime(row.from) && isTime(row.to) && minutesOf(row.to) <= minutesOf(row.from);
}

export function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

// ── the policy form ─────────────────────────────────────────────────────────

/** The order the fields read in a form: what a table *is*, then who may book
 *  it, then when, then the money. */
export const POLICY_FIELDS = [
  'seatingMinutes',
  'slotMinutes',
  'maxGuests',
  'maxLeadDays',
  'minLeadMinutes',
  'depositPerGuestAmd',
  'freeCancelHours',
  'autoConfirm',
] as const satisfies readonly (keyof BookingPolicyFields)[];

export type PolicyField = (typeof POLICY_FIELDS)[number];

/** The one boolean among them, which is drawn as a switch rather than a box. */
export const BOOLEAN_POLICY_FIELDS: readonly PolicyField[] = ['autoConfirm'];

export function isBooleanField(field: PolicyField): boolean {
  return BOOLEAN_POLICY_FIELDS.includes(field);
}

/**
 * What one row of the policy form shows.
 *
 * `decidedHere` drives the switch and `value` the input. The input shows the
 * inherited figure when the switch is off — greyed, but present: a blank box
 * beside "follows the chain" tells a manager nothing about what their branch
 * actually does, which is the question they came to answer.
 */
export interface PolicyRow {
  field: PolicyField;
  decidedHere: boolean;
  source: PolicySource;
  value: number | boolean;
  inherited: number | boolean;
}

export function policyRows(view: BookingPolicyView): PolicyRow[] {
  return POLICY_FIELDS.map((field) => ({
    field,
    decidedHere: view.own[field] !== null,
    source: view.sources[field],
    value: view.effective[field],
    inherited: view.inherited[field],
  }));
}

/**
 * The patch for turning one row's switch on or off.
 *
 * Off sends an explicit `null` — the only way an override is undone. On sends
 * the value already in force, so taking the decision over changes nothing by
 * itself; a switch that also changed the number would make "decide this here"
 * an edit nobody asked for.
 */
export function overrideToggle(
  row: PolicyRow,
  decidedHere: boolean,
): Partial<BookingPolicyFields> {
  return { [row.field]: decidedHere ? row.value : null } as Partial<BookingPolicyFields>;
}

/**
 * What a typed value should be saved as, or null when it is not a number worth
 * sending yet.
 *
 * An empty box is *not* a zero and not an inheritance — it is somebody
 * mid-edit, and saving on it would either wipe the setting or set the deposit
 * to nothing.
 */
export function parsePolicyNumber(
  raw: string,
  limits: { min: number; max: number } | undefined,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (limits && (value < limits.min || value > limits.max)) {
    return null;
  }
  return value;
}

// ── closures ────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` for today in Yerevan — the earliest date the picker offers,
 *  because a day off in the past is not something anybody can arrange. */
export function todayInYerevan(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
