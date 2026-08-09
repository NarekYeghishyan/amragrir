'use client';

import type { BasketPanel } from './basket-panel';
import { notifyBasketChanged, readBasketCount } from './basket-count';

/**
 * The newest priced basket, shared between the controls that change it.
 *
 * A restaurant page has two of them and they are nowhere near each other in the
 * tree: the `＋` on every dish card, and the order panel down the side. Pressing
 * one has to move the other, and the thing that changed hands is exactly a
 * `BasketPanel` — the live actions answer with the new one, priced by the same
 * function `GET /[lang]/basket` uses.
 *
 * Without this the panel could only find out by asking again, which is a second
 * round trip after the one that already had the answer, and about a second of a
 * `＋` that visibly did nothing.
 *
 * It doubles as the panel's memory across a remount: a value is kept per branch
 * so a panel that mounts into a page where the basket is already known starts
 * from it rather than from "not asked yet".
 *
 * **Only ever written in the browser.** This module is imported by client
 * components, so it also exists on the server — where one shared map would be
 * one visitor's basket handed to the next. Every write below happens in an
 * event handler or an effect, neither of which runs while rendering on the
 * server, so the server's copy stays empty and every first paint is `null`.
 * Nothing may write to it during render.
 */

const lastSeen = new Map<string, BasketPanel>();
const watchers = new Set<(branchId: string) => void>();

/**
 * The basket count as of the last locally published basket.
 *
 * The panel also refetches whenever the count cookie moves, which is how it
 * hears about a change made in another tab. Without this it would hear its own
 * writes that way too, and fetch a second copy of an answer it had already been
 * handed — one wasted round trip per press, and worse than wasted: two presses
 * in quick succession leave two of those in flight, and the older one landing
 * last puts the quantity back down for a moment.
 */
let publishedCount = -1;

/** What is already known about this branch's basket, or null. */
export function lastBasket(branchId: string): BasketPanel | null {
  return lastSeen.get(branchId) ?? null;
}

/** True where this count is one this page has already been told about, and so
 *  needs no fetch to explain it. */
export function alreadyPublished(count: number): boolean {
  return count === publishedCount;
}

/**
 * Hands round a basket that has just come back from the server.
 *
 * Also tells the header's count watchers, because the same write changed the
 * cookie they read — one call at the end of a write rather than two.
 */
export function publishBasket(branchId: string, panel: BasketPanel): void {
  lastSeen.set(branchId, panel);
  // The write that produced this panel set the cookie on the way back, so this
  // is the count the watchers are about to read.
  publishedCount = readBasketCount();
  watchers.forEach((notify) => notify(branchId));
  notifyBasketChanged();
}

export function subscribeBasket(onPublish: (branchId: string) => void): () => void {
  watchers.add(onPublish);
  return () => {
    watchers.delete(onPublish);
  };
}
