import { describe, expect, it } from 'vitest';
import type { BookingPolicyView } from './api';
import {
  DEFAULT_FROM,
  DEFAULT_TO,
  WEEKDAYS,
  draftFromHours,
  hoursFromDraft,
  hoursProblem,
  overrideToggle,
  parsePolicyNumber,
  policyRows,
  runsPastMidnight,
  todayInYerevan,
} from './booking-model';

describe('the weekly hours editor', () => {
  it('starts from the kitchen’s hours when the branch has said nothing', () => {
    // So that turning "decide here" on changes nothing by itself. A form that
    // started blank would make that switch a destructive act.
    const rows = draftFromHours(null);

    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.day)).toEqual([...WEEKDAYS]);
    expect(rows.every((row) => row.open && row.from === DEFAULT_FROM && row.to === DEFAULT_TO)).toBe(
      true,
    );
  });

  it('reads a shut day as shut', () => {
    const rows = draftFromHours({ sun: { closed: true } });
    expect(rows.find((row) => row.day === 'sun')?.open).toBe(false);
  });

  it('keeps the times under a shut day, so reopening restores them', () => {
    const rows = draftFromHours({ sun: { closed: true, open: '12:00', close: '20:00' } });
    const sunday = rows.find((row) => row.day === 'sun');

    expect(sunday?.open).toBe(false);
    expect(sunday?.from).toBe('12:00');
  });

  it('spreads a default entry across every day it does not name', () => {
    const rows = draftFromHours({
      default: { open: '12:00', close: '22:00' },
      mon: { closed: true },
    });

    expect(rows.find((row) => row.day === 'mon')?.open).toBe(false);
    expect(rows.find((row) => row.day === 'tue')?.from).toBe('12:00');
  });

  it('round-trips a week without losing a day', () => {
    // The failure this guards: a form that reads a week differently from the
    // way it writes one loses a Sunday every time somebody saves.
    const original = {
      mon: { open: '18:00', close: '23:00' },
      tue: { open: '18:00', close: '23:00' },
      wed: { open: '18:00', close: '23:00' },
      thu: { open: '18:00', close: '23:00' },
      fri: { open: '18:00', close: '02:00' },
      sat: { open: '12:00', close: '02:00' },
      sun: { closed: true },
    };

    expect(hoursFromDraft(draftFromHours(original))).toEqual(original);
  });

  it('writes every day out rather than leaving one to fall through', () => {
    // A day left unsaid would defer to the kitchen's hours and quietly reopen.
    const written = hoursFromDraft(draftFromHours({ mon: { closed: true } }));
    expect(Object.keys(written).sort()).toEqual([...WEEKDAYS].sort());
  });

  it('accepts a night that runs past midnight', () => {
    // Refusing this would leave a late-night restaurant unable to describe
    // itself, which is the bug stage one existed to fix.
    const rows = draftFromHours({ default: { open: '18:00', close: '02:00' } });

    expect(hoursProblem(rows)).toBeNull();
    expect(runsPastMidnight(rows[0]!)).toBe(true);
  });

  it('names the day whose times are unusable', () => {
    const rows = draftFromHours(null).map((row) =>
      row.day === 'wed' ? { ...row, from: '10:0' } : row,
    );
    expect(hoursProblem(rows)).toBe('wed');
  });

  it('ignores the times of a day nobody is open on', () => {
    const rows = draftFromHours(null).map((row) =>
      row.day === 'wed' ? { ...row, open: false, from: 'nonsense' } : row,
    );
    expect(hoursProblem(rows)).toBeNull();
  });
});

const VIEW: BookingPolicyView = {
  own: {
    seatingMinutes: 120,
    slotMinutes: null,
    maxGuests: null,
    maxLeadDays: null,
    minLeadMinutes: null,
    depositPerGuestAmd: null,
    freeCancelHours: null,
    autoConfirm: null,
  },
  inherited: {
    seatingMinutes: 90,
    slotMinutes: 10,
    maxGuests: 40,
    maxLeadDays: 30,
    minLeadMinutes: 60,
    depositPerGuestAmd: 2000,
    freeCancelHours: 2,
    autoConfirm: true,
  },
  effective: {
    seatingMinutes: 120,
    slotMinutes: 10,
    maxGuests: 40,
    maxLeadDays: 30,
    minLeadMinutes: 60,
    depositPerGuestAmd: 2000,
    freeCancelHours: 2,
    autoConfirm: true,
  },
  sources: {
    seatingMinutes: 'branch',
    slotMinutes: 'platform',
    maxGuests: 'restaurant',
    maxLeadDays: 'platform',
    minLeadMinutes: 'platform',
    depositPerGuestAmd: 'platform',
    freeCancelHours: 'platform',
    autoConfirm: 'platform',
  },
  limits: { seatingMinutes: { min: 30, max: 480 }, maxGuests: { min: 1, max: 200 } },
};

describe('the policy form', () => {
  it('marks the rows this branch decided for itself', () => {
    const rows = policyRows(VIEW);
    const seating = rows.find((row) => row.field === 'seatingMinutes');
    const slot = rows.find((row) => row.field === 'slotMinutes');

    expect(seating?.decidedHere).toBe(true);
    expect(seating?.value).toBe(120);
    expect(seating?.inherited).toBe(90);
    expect(slot?.decidedHere).toBe(false);
    expect(slot?.source).toBe('platform');
  });

  it('shows an inherited row the figure in force, not a blank', () => {
    // A blank box beside "follows the chain" tells a manager nothing about what
    // their branch actually does, which is the question they came to answer.
    const maxGuests = policyRows(VIEW).find((row) => row.field === 'maxGuests');
    expect(maxGuests?.value).toBe(40);
    expect(maxGuests?.source).toBe('restaurant');
  });

  it('hands a question back with an explicit null', () => {
    const seating = policyRows(VIEW).find((row) => row.field === 'seatingMinutes')!;
    expect(overrideToggle(seating, false)).toEqual({ seatingMinutes: null });
  });

  it('takes a decision over at the value already in force', () => {
    // Turning the switch on must change nothing by itself; a switch that also
    // moved the number would be an edit nobody asked for.
    const slot = policyRows(VIEW).find((row) => row.field === 'slotMinutes')!;
    expect(overrideToggle(slot, true)).toEqual({ slotMinutes: 10 });
  });
});

describe('parsing a typed number', () => {
  it('refuses an empty box rather than reading it as zero', () => {
    // Saving on a half-typed field would either wipe the setting or set the
    // deposit to nothing.
    expect(parsePolicyNumber('', { min: 0, max: 100 })).toBeNull();
    expect(parsePolicyNumber('  ', { min: 0, max: 100 })).toBeNull();
  });

  it('refuses anything that is not a whole number', () => {
    expect(parsePolicyNumber('9.5', { min: 0, max: 100 })).toBeNull();
    expect(parsePolicyNumber('-4', { min: -10, max: 100 })).toBeNull();
    expect(parsePolicyNumber('two', { min: 0, max: 100 })).toBeNull();
  });

  it('refuses a number outside the bounds the API ships', () => {
    expect(parsePolicyNumber('500', { min: 30, max: 480 })).toBeNull();
    expect(parsePolicyNumber('480', { min: 30, max: 480 })).toBe(480);
  });

  it('accepts zero where zero is a real answer', () => {
    // A branch taking walk-up bookings sets the notice period to nothing.
    expect(parsePolicyNumber('0', { min: 0, max: 1440 })).toBe(0);
  });
});

describe('todayInYerevan', () => {
  it('is the restaurant’s today, not the browser’s', () => {
    // 22:00 UTC is already tomorrow in Yerevan, and a picker offering
    // "yesterday" to somebody closing up at 2am is offering a day off nobody
    // can arrange.
    expect(todayInYerevan(new Date('2026-08-10T22:00:00.000Z'))).toBe('2026-08-11');
    expect(todayInYerevan(new Date('2026-08-10T10:00:00.000Z'))).toBe('2026-08-10');
  });
});
