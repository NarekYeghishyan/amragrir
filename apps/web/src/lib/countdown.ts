/**
 * The tracking countdown, between one server value and the next.
 *
 * `GET /orders/:id` answers with `secondsLeft`, and the page it feeds re-renders
 * every ten seconds (`OrderRefresh`). Left at that, the number on screen holds
 * still for ten seconds and then drops ten — which reads as a stuck order, the
 * one thing a countdown exists to rule out. This is the arithmetic that fills
 * the gap in the browser; the server stays the only thing that decides what is
 * left, and this only says how much of it has since gone by.
 */

/**
 * What is left of `fromServer` seconds, `elapsedMs` after it was read.
 *
 * Measured against the clock rather than by subtracting one per tick. A
 * background tab's interval is throttled to roughly once a minute and a
 * sleeping laptop stops firing it altogether, so a counter that decrements
 * itself comes back minutes behind — and it comes back wrong in the direction
 * of "still cooking", which is the direction that keeps somebody sitting down.
 *
 * Never negative: an order whose promise has passed shows `0:00` until the next
 * poll moves the status, exactly as the API's own `countdown()` floors it.
 */
export function remainingSeconds(fromServer: number, elapsedMs: number): number {
  return Math.max(0, Math.round(fromServer - Math.max(0, elapsedMs) / 1000));
}
