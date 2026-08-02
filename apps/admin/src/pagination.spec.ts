import { describe, expect, it } from 'vitest';
import { PAGE_GAP, pageNumbers } from './ui/core';

/**
 * The pager's arithmetic, tested without a DOM.
 *
 * `pageNumbers` is pure and exported for exactly this: the interesting part of
 * a pager is not what it looks like but where it puts the ellipses, and that is
 * off-by-one territory at both ends.
 */
describe('pageNumbers', () => {
  it('shows every page while they all fit', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('opens with a gap only on the far side', () => {
    // Near the start there is nothing to elide on the left, so the run of
    // early pages stays whole.
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 20]);
    expect(pageNumbers(3, 20)).toEqual([1, 2, 3, 4, 5, PAGE_GAP, 20]);
  });

  it('mirrors that at the end', () => {
    expect(pageNumbers(20, 20)).toEqual([1, PAGE_GAP, 16, 17, 18, 19, 20]);
    expect(pageNumbers(18, 20)).toEqual([1, PAGE_GAP, 16, 17, 18, 19, 20]);
  });

  it('brackets the current page in the middle', () => {
    expect(pageNumbers(10, 20)).toEqual([1, PAGE_GAP, 9, 10, 11, PAGE_GAP, 20]);
  });

  it('keeps one width, so buttons do not move under the cursor', () => {
    // The reason for the clamping. Walking 1 → 20 must never resize the strip,
    // or the page you meant to click is somewhere else by the time you do.
    const widths = new Set(
      Array.from({ length: 20 }, (_, index) => pageNumbers(index + 1, 20).length),
    );
    expect([...widths]).toEqual([7]);
  });

  it('never repeats a page or emits one out of range', () => {
    for (const pages of [8, 9, 12, 40]) {
      for (let current = 1; current <= pages; current++) {
        const shown = pageNumbers(current, pages).filter(
          (entry): entry is number => entry !== PAGE_GAP,
        );
        expect(new Set(shown).size).toBe(shown.length);
        expect(Math.min(...shown)).toBeGreaterThanOrEqual(1);
        expect(Math.max(...shown)).toBeLessThanOrEqual(pages);
        // Ascending, or the ellipsis is standing in for nothing.
        expect([...shown].sort((a, b) => a - b)).toEqual(shown);
        expect(shown).toContain(current);
      }
    }
  });

  it('elides at least two pages wherever it puts a gap', () => {
    // A "…" hiding a single page is worse than the page — same width, no
    // information, and one more click to reach it.
    for (const pages of [8, 9, 12, 40]) {
      for (let current = 1; current <= pages; current++) {
        const entries = pageNumbers(current, pages);
        entries.forEach((entry, index) => {
          if (entry !== PAGE_GAP) {
            return;
          }
          const before = entries[index - 1] as number;
          const after = entries[index + 1] as number;
          expect(after - before).toBeGreaterThan(2);
        });
      }
    }
  });
});
