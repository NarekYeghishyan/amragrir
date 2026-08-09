import { useCallback, useEffect, useRef, useState } from 'react';
import { StaffNotificationType, type Language } from '@amragrir/shared';
import { api, errorText, type StaffNotification } from './api';
import { formatDateTime } from './format';
import { useLanguage } from './i18n';
import type { Translate } from './language';
import { routePath } from './navigation';
import { watchNotifications } from './order-stream';
import { Link } from './router';
import { Badge, Banner, Dialog, DialogBody, EmptyState, Icon, Skeleton } from './ui';

/**
 * The back office's bell.
 *
 * A branch is told things — so far, that a pre-order is about to need cooking —
 * and this is where a shift reads them. It lives in the shell rather than on the
 * board because the whole point of a reminder is that it reaches somebody who is
 * looking at something else: an order due at eight is announced at ten past
 * seven, and nobody is watching the Scheduled tab at ten past seven.
 *
 * Nothing here is prose from the API. The rows are written by a job, and a job
 * has no request to take a language from — so they carry a type and some
 * numbers, and the sentences are built below out of this panel's own dictionary,
 * exactly as an order status is.
 */

/** How often the bell re-reads, when nothing has arrived on the socket. The
 *  socket is the fast path; this is what keeps the count honest through a
 *  dropped connection. */
const POLL_MS = 60_000;

/** What a notification says happened. */
export function notificationHeadline(t: Translate, item: StaffNotification): string {
  switch (item.type) {
    case StaffNotificationType.PrepDue:
      // The order's name. It used to be the pickup code, and a bell left open
      // on a counter is the last place that belongs — see `PrepDuePayload`.
      // Rows written before the switch carry `code` too, so nothing older
      // falls back to the nameless line for want of the field.
      return item.payload?.code === undefined
        ? t('notificationPrepDue')
        : t('notificationPrepDueCode', { code: item.payload.code });
  }
}

/**
 * The numbers under it, as one line — when the food is due, when the kitchen
 * has to start, and how much there is of it.
 *
 * Whatever the payload actually carries, and nothing for what it does not: an
 * order placed before pre-ordering existed recorded no estimate, and a line
 * reading "start —" would be worse than a line without it.
 */
export function notificationDetail(
  t: Translate,
  item: StaffNotification,
  language: Language,
): string | null {
  const payload = item.payload;
  if (payload === null) {
    return null;
  }

  const parts: string[] = [];
  if (payload.readyAt !== undefined && payload.readyAt !== null) {
    parts.push(t('orderDueAt', { when: formatDateTime(payload.readyAt, language) }));
  }
  if (payload.prepStartAt !== undefined && payload.prepStartAt !== null) {
    parts.push(t('orderStartAt', { when: formatDateTime(payload.prepStartAt, language) }));
  }
  if (payload.itemsCount !== undefined) {
    parts.push(t.plural('dishCount', payload.itemsCount));
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * Where the entry leads — the order it is about, on the board.
 *
 * By code rather than by id, because that is what the board's address takes: it
 * searches, and then lands on whichever stage holds the order. Null when the row
 * names no order, which no kind does yet and a later one might.
 */
export function notificationHref(item: StaffNotification): string | null {
  const code = item.payload?.code;
  if (code === undefined) {
    return null;
  }
  return routePath({
    tab: 'Orders',
    scope: { restaurantId: null, branchId: item.branchId, orderCode: code },
  });
}

/** The ones this reader has not seen. Extracted so the dialog's "mark these
 *  read" is a statement about exactly what was on screen. */
export function unreadIds(items: readonly StaffNotification[]): string[] {
  return items.filter((item) => !item.read).map((item) => item.id);
}

export function NotificationBell({ t }: { t: Translate }) {
  const { language } = useLanguage();
  const [items, setItems] = useState<StaffNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await api.notifications();
      setItems(result.items);
      setUnread(result.unread);
      setError(null);
    } catch (err) {
      setItems((current) => current ?? []);
      setError(errorText(t, err, 'errorLoadNotifications'));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(poll);
  }, [load]);

  // The socket carries the fact that something arrived, not the row itself: the
  // broadcast is deliberately thin, and reading the list is what puts the entry
  // in front of somebody with its numbers and its reach already checked.
  useEffect(() => {
    const stream = watchNotifications(() => void load());
    return () => stream.close();
  }, [load]);

  // Opening the bell is reading it. Marked once per open, against the ids that
  // were on screen when it opened — a row that arrives while it is open stays
  // unread, which is the honest answer: nobody has looked at it.
  const marked = useRef(false);
  useEffect(() => {
    if (!open) {
      marked.current = false;
      return;
    }
    if (marked.current || items === null) {
      return;
    }
    const ids = unreadIds(items);
    if (ids.length === 0) {
      return;
    }
    marked.current = true;

    api
      .readNotifications(ids)
      .then(() => {
        const seen = new Set(ids);
        setItems((current) =>
          (current ?? []).map((item) => (seen.has(item.id) ? { ...item, read: true } : item)),
        );
        setUnread((current) => Math.max(0, current - ids.length));
      })
      .catch(() => {
        // Silent, and deliberately so: failing to record that somebody looked at
        // a list is not worth interrupting them over, and the next open tries
        // again. The one cost is a count that stays high for a minute.
        marked.current = false;
      });
  }, [open, items]);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('notificationsTitle')}
      description={t('notificationsDesc')}
      trigger={
        <button type="button" className="bell" aria-label={t('notificationsAction')}>
          <Icon name="bell" size={17} />
          <span className="bell__text">{t('notificationsAction')}</span>
          {/* The number, and only when there is one. A badge reading "0" is a
              badge somebody learns to stop looking at. */}
          {unread > 0 && <span className="bell__count">{unread}</span>}
        </button>
      }
    >
      <DialogBody>
        {error !== null && <Banner>{error}</Banner>}

        {items === null ? (
          <Skeleton count={3} height={56} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell"
            title={t('notificationsEmptyTitle')}
            description={t('notificationsEmptyDesc')}
          />
        ) : (
          <ol className="bells">
            {items.map((item) => {
              const detail = notificationDetail(t, item, language);
              const href = notificationHref(item);
              return (
                <li
                  key={item.id}
                  className={item.read ? 'bells__entry' : 'bells__entry bells__entry--new'}
                >
                  <div className="row spread">
                    <span className="bells__what">{notificationHeadline(t, item)}</span>
                    <time className="bells__at" dateTime={item.createdAt}>
                      {formatDateTime(item.createdAt, language)}
                    </time>
                  </div>
                  {detail !== null && <p className="bells__detail">{detail}</p>}
                  <div className="row">
                    {/* Only on the ones nobody has accepted. Since paying
                        confirms a pre-order outright this is the older rows, and
                        saying so is the difference between "go and cook this"
                        and "go and look at this". */}
                    {item.payload?.needsConfirming === true && (
                      <Badge tone="warn">{t('notificationNeedsConfirming')}</Badge>
                    )}
                    {href !== null && (
                      <Link to={href} className="bells__open" onClick={() => setOpen(false)}>
                        {t('notificationOpen')}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogBody>
    </Dialog>
  );
}
