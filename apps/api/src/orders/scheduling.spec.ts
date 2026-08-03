import {
  ORDER_MAX_LEAD_DAYS,
  PREP_REMINDER_BUFFER_MIN,
  defaultReminderLeadMin,
} from '@amragrir/shared';
import { READY_AT_SLACK_MS, reminderFor, resolveSchedule } from './scheduling';

/**
 * Pre-order timings — see BUSINESS_LOGIC.md §4.
 *
 * Every case fixes `now` rather than reading the clock, because half of these
 * rules are about the difference between two times and a test that ran at 23:59
 * would otherwise answer a different question than one that ran at noon.
 */

/** A Wednesday, 12:00 Yerevan (08:00 UTC — Armenia is UTC+4 all year). */
const NOW = new Date('2026-08-05T08:00:00.000Z');

/** Open 10:00–23:00 local, every day. */
const OPEN_ALWAYS = { default: { open: '10:00', close: '23:00' } };

const at = (iso: string): string => new Date(iso).toISOString();

const resolve = (over: Partial<Parameters<typeof resolveSchedule>[0]> = {}) =>
  resolveSchedule({
    requestedReadyAt: undefined,
    prepMin: 20,
    openHours: OPEN_ALWAYS,
    now: NOW,
    ...over,
  });

describe('an order placed for as soon as possible', () => {
  it('is ready in the time the kitchen needs', () => {
    const result = resolve();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.readyAt.toISOString()).toBe(at('2026-08-05T08:20:00.000Z'));
  });

  it('starts now, because there is nothing to wait for', () => {
    const result = resolve();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.prepStartAt.toISOString()).toBe(NOW.toISOString());
  });

  it('has no notice either, because there is nothing to give notice of', () => {
    // The lead and the reminder are set together and cleared together. Half a
    // pair — a lead on an order nothing will ever warn about — would be a number
    // the panel would offer somebody to edit for no effect.
    const result = resolve();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.reminderLeadMin).toBeNull();
  });

  it('arms no reminder — the kitchen already has it', () => {
    // The whole distinction between a pre-order and an ordinary one, and it
    // falls out of the arithmetic rather than being a flag somebody sets: the
    // reminder would land in the past, and there is nobody to warn.
    const result = resolve();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.reminderAt).toBeNull();
  });

  it('is not a pre-order merely because the client echoed the earliest time', () => {
    // The basket sends back the `earliestReadyAt` a quote gave it seconds ago.
    // That is "now" written as a timestamp, and treating it as a booking would
    // put every ordinary order on the Scheduled tab.
    const result = resolve({ requestedReadyAt: at('2026-08-05T08:20:00.000Z') });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.reminderAt).toBeNull();
  });
});

describe('a pre-order', () => {
  const TOMORROW_13_00 = at('2026-08-06T09:00:00.000Z');

  it('keeps the time the customer asked for', () => {
    const result = resolve({ requestedReadyAt: TOMORROW_13_00 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.readyAt.toISOString()).toBe(TOMORROW_13_00);
  });

  it('starts the kitchen one prep estimate before it is wanted', () => {
    const result = resolve({ requestedReadyAt: TOMORROW_13_00 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 13:00 less twenty minutes.
    expect(result.schedule.prepStartAt.toISOString()).toBe(at('2026-08-06T08:40:00.000Z'));
  });

  it('warns the branch a buffer before that, not at the moment itself', () => {
    // A notification that arrives exactly when work must begin is not a warning,
    // it is a deadline that has already passed.
    const result = resolve({ requestedReadyAt: TOMORROW_13_00 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.reminderAt?.toISOString()).toBe(
      new Date(
        new Date(at('2026-08-06T08:40:00.000Z')).getTime() -
          PREP_REMINDER_BUFFER_MIN * 60_000,
      ).toISOString(),
    );
  });

  it('carries the notice as a number, not only as an instant', () => {
    // The panel shows it and a shift edits it, so it has to be a figure
    // somebody can read back rather than the difference between two timestamps
    // they are left to subtract.
    const result = resolve({ requestedReadyAt: TOMORROW_13_00 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schedule.reminderLeadMin).toBe(defaultReminderLeadMin(20));
    // And that number is exactly the gap it describes.
    expect(result.schedule.reminderAt?.toISOString()).toBe(
      reminderFor(new Date(TOMORROW_13_00), defaultReminderLeadMin(20)).toISOString(),
    );
  });

  it('is a pre-order exactly when there is still time to warn somebody', () => {
    // The boundary. Anything closer than prep + buffer leaves no warning to
    // give, so it is an ordinary order however it was phrased.
    const boundary = new Date(
      NOW.getTime() + (20 + PREP_REMINDER_BUFFER_MIN) * 60_000,
    );

    expect(resolveOk({ requestedReadyAt: boundary.toISOString() }).reminderAt).toBeNull();
    expect(
      resolveOk({
        requestedReadyAt: new Date(boundary.getTime() + 60_000).toISOString(),
      }).reminderAt,
    ).not.toBeNull();
  });
});

describe('times a branch cannot honour', () => {
  it('refuses one the kitchen could not manage', () => {
    const result = resolve({ requestedReadyAt: at('2026-08-05T08:05:00.000Z') });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('too_soon');
  });

  it('hands back the earliest it could manage, so the picker can redraw', () => {
    // Refusing without saying what is possible leaves the basket screen with a
    // dead end and the customer guessing.
    const result = resolve({ requestedReadyAt: at('2026-08-05T08:05:00.000Z') });

    expect(result.ok).toBe(false);
    if (result.ok || result.refusal.kind !== 'too_soon') return;
    expect(result.refusal.earliestReadyAt.toISOString()).toBe(at('2026-08-05T08:20:00.000Z'));
  });

  it('tolerates a few seconds early, which is only clock skew', () => {
    const barelyEarly = new Date(
      NOW.getTime() + 20 * 60_000 - (READY_AT_SLACK_MS - 5_000),
    );

    expect(resolve({ requestedReadyAt: barelyEarly.toISOString() }).ok).toBe(true);
  });

  it('refuses one further ahead than orders may be scheduled', () => {
    const tooFar = new Date(NOW.getTime() + (ORDER_MAX_LEAD_DAYS + 1) * 86_400_000);
    const result = resolve({ requestedReadyAt: tooFar.toISOString() });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('too_far');
  });

  it('refuses a collection time outside the branch hours', () => {
    // The gap this closes: nothing used to stop a pickup being booked for 04:00,
    // and the first anyone would know is a customer at a locked door.
    const result = resolve({ requestedReadyAt: at('2026-08-07T00:00:00.000Z') });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('closed');
  });

  it('refuses a day the branch is shut', () => {
    const result = resolve({
      openHours: { ...OPEN_ALWAYS, thu: { closed: true } },
      requestedReadyAt: at('2026-08-06T09:00:00.000Z'),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('closed');
  });

  it('leaves an as-soon-as-possible order alone at closing time', () => {
    // 22:55 local, with twenty minutes of prep — ready at 23:15, past closing.
    // An ordinary thing to sell, and refusing it would be refusing a customer
    // standing in a shop that is open.
    const closingTime = new Date('2026-08-05T18:55:00.000Z');

    expect(resolveSchedule({
      requestedReadyAt: undefined,
      prepMin: 20,
      openHours: OPEN_ALWAYS,
      now: closingTime,
    }).ok).toBe(true);
  });

  it('refuses a date that is not one', () => {
    const result = resolve({ requestedReadyAt: 'next tuesday please' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.kind).toBe('invalid_date');
  });
});

function resolveOk(over: Partial<Parameters<typeof resolveSchedule>[0]>) {
  const result = resolve(over);
  if (!result.ok) {
    throw new Error(`expected a schedule, got ${result.refusal.kind}`);
  }
  return result.schedule;
}
