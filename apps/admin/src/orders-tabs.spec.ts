import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUS_FLOW,
  OrderStatus,
  QUEUE_FILTER_STATUSES,
  QueueFilter,
} from '@amragrir/shared';
import { NO_ORDER_FILTERS } from './api';
import { PAID_TABS, STAGE_TABS, topStage } from './screens/Orders';

/**
 * The shape of the board's tabs.
 *
 * One per status, in the order an order moves through them, with `paid` first
 * among them because it is the only stage whose next move belongs to the
 * restaurant. The board is the state machine: every count on it is a number
 * somebody can act on, which a coarser tab could not promise.
 *
 * `scheduled` sits ahead of all of it and is not part of that run — a pre-order
 * is not yet anybody's work, and it is on a tab of its own precisely so it is
 * *not* on the live board pinned above the orders somebody is cooking.
 */
describe('the stage tabs', () => {
  it('runs one tab per status, in the order the kitchen works them', () => {
    expect(STAGE_TABS.map((tab) => tab.value)).toEqual([
      QueueFilter.Scheduled,
      QueueFilter.Paid,
      QueueFilter.Confirmed,
      QueueFilter.Preparing,
      QueueFilter.AlmostReady,
      QueueFilter.Ready,
      QueueFilter.Past,
    ]);
  });

  it('opens on paid, which is not the first tab', () => {
    // First in the strip and not the landing tab: the difference between "here
    // if you want it" and "here is what to do next". A booking for Saturday is
    // the former.
    expect(NO_ORDER_FILTERS.stage).toBe(QueueFilter.Paid);
    expect(STAGE_TABS[0].value).toBe(QueueFilter.Scheduled);
  });

  it('follows the state machine, so the strip is the path an order takes', () => {
    // Each tab but the last holds exactly one status, and that status's only
    // move forward is the status behind the next tab. A stage inserted in the
    // wrong place, or one that quietly widened, fails here.
    //
    // `scheduled` is dropped from the run rather than exempted inside it: it is
    // the one stage that is a moment in time as well as a set of statuses (it
    // admits both `paid` and `confirmed`), so it has no single status to be the
    // next step of anything.
    const working = STAGE_TABS.filter((tab) => tab.value !== QueueFilter.Scheduled).slice(0, -1);

    for (const [index, tab] of working.entries()) {
      const statuses = QUEUE_FILTER_STATUSES[tab.value];
      expect(statuses).toHaveLength(1);

      const next = working[index + 1];
      if (next !== undefined) {
        expect(ORDER_STATUS_FLOW[statuses[0]]).toContain(QUEUE_FILTER_STATUSES[next.value][0]);
      }
    }
  });

  it('keeps the booked tab a question about time, not about status', () => {
    // It shares its statuses with Paid and Confirmed on purpose — a pre-order is
    // `paid` exactly like an order at the counter, and the difference is a
    // timestamp. Which is why the API cannot answer it by grouping on status,
    // and why this tab is not a step in the run above.
    expect(QUEUE_FILTER_STATUSES[QueueFilter.Scheduled]).toEqual([
      OrderStatus.Paid,
      OrderStatus.Confirmed,
    ]);
  });

  it('ends on the one stage that is not work', () => {
    expect(QUEUE_FILTER_STATUSES[QueueFilter.Past]).toEqual([
      OrderStatus.Completed,
      OrderStatus.Cancelled,
    ]);
  });

  it('reaches the unpaid orders under Paid, and nowhere else', () => {
    // They are not a step in the flow, so they get no place on the top strip —
    // but nothing expires those rows either, so without a tab they would pile
    // up entirely out of sight.
    const onTheStrip = STAGE_TABS.flatMap((tab) => [...QUEUE_FILTER_STATUSES[tab.value]]);
    expect(onTheStrip).not.toContain(OrderStatus.Created);

    expect(PAID_TABS.map((tab) => tab.value)).toEqual([QueueFilter.Paid, QueueFilter.Unpaid]);
    expect(QUEUE_FILTER_STATUSES[QueueFilter.Unpaid]).toEqual([OrderStatus.Created]);
  });

  it('leaves Paid lit while the unpaid filter is on', () => {
    // Otherwise picking the inner filter would empty the top strip — the board
    // would be showing orders under a stage that looks closed.
    expect(topStage(QueueFilter.Unpaid)).toBe(QueueFilter.Paid);

    for (const stage of STAGE_TABS.map((tab) => tab.value)) {
      expect(topStage(stage)).toBe(stage);
    }
  });
});
