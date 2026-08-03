import { useEffect, useState } from 'react';
import {
  REMINDER_LEAD_MAX_MINUTES,
  REMINDER_LEAD_MIN_MINUTES,
  type Language,
} from '@amragrir/shared';
import { api, errorText, type OrderReminder, type StaffOrder } from './api';
import { formatDateTime } from './format';
import { useLanguage } from './i18n';
import type { Translate } from './language';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Field,
  TextInput,
  useToast,
} from './ui';

/**
 * How much notice the branch wants on one pre-order.
 *
 * The number arrives as the prep estimate plus a fixed buffer, which is a
 * reasonable default and a poor rule: the estimate is the slowest dish on the
 * ticket, and the person working the pass knows things a menu column does not.
 * A skewer wants the coals lit before it wants cooking, so thirty minutes of
 * cooking can be forty-five minutes of notice — and that is a judgement, not a
 * correction to the menu.
 *
 * Which is why this edits the *warning* and leaves `prep_min` alone. Changing
 * the estimate would move the earliest time a customer may order for, and this
 * has nothing to do with customers: the food is still promised for the same
 * minute, and what moves is when a kitchen hears about it.
 */

/**
 * The lead as a number, or null when what was typed is not one.
 *
 * Bounds from `shared`, the same ones the DTO validates against — a form that
 * accepted a value the API refuses would waste somebody's time at the pass, and
 * two copies of the range would be the way that happens.
 *
 * Whole minutes only. `parseInt` would read "45 min" as 45 and "4.5" as 4, so
 * the string is matched before it is parsed: a half-typed value is not a
 * different number, it is not a number yet.
 */
export function reminderLead(raw: string): number | null {
  if (!/^\d{1,5}$/.test(raw.trim())) {
    return null;
  }
  const minutes = Number(raw.trim());
  return minutes >= REMINDER_LEAD_MIN_MINUTES && minutes <= REMINDER_LEAD_MAX_MINUTES
    ? minutes
    : null;
}

/**
 * When a given notice would fall due, as an ISO instant.
 *
 * So the dialog can say the time rather than the arithmetic. "45" means nothing
 * on its own to somebody deciding whether it is enough; "warned at 12:15" is the
 * thing they are actually choosing.
 *
 * Counted from `readyAt` and not from the start of cooking, which is the whole
 * definition of the lead — see `orders.reminder_lead_min`.
 */
export function reminderFiresAt(readyAt: string, leadMin: number): string {
  return new Date(new Date(readyAt).getTime() - leadMin * 60_000).toISOString();
}

/**
 * What the trigger on the card says.
 *
 * The current notice, not the word "Reminder": a button that names its value is
 * a button somebody can read without pressing, and on a board of pre-orders the
 * differences between the cards are the whole point.
 */
export function reminderLabel(t: Translate, order: StaffOrder): string {
  return order.reminderLeadMin === null
    ? t('orderReminderUnset')
    : t('orderReminderAction', { minutes: order.reminderLeadMin });
}

/**
 * When a pre-order is due, and when the kitchen has to start on it.
 *
 * Both, because they answer different questions and a card showing one of them
 * invites the other to be worked out wrong. Null when the order is not a
 * pre-order — an order wanted as soon as possible has a countdown instead, and
 * the two together would be the same fact stated twice.
 */
export function scheduleLine(
  t: Translate,
  order: StaffOrder,
  language: Language,
): string | null {
  if (!order.scheduled || order.readyAt === null) {
    return null;
  }
  const due = t('orderDueAt', { when: formatDateTime(order.readyAt, language) });
  return order.prepStartAt === null
    ? due
    : `${due} · ${t('orderStartAt', { when: formatDateTime(order.prepStartAt, language) })}`;
}

/**
 * The dialog behind that button.
 *
 * Answers with the warning alone and hands it back to the board, which patches
 * the one card. Reloading the page would be the obvious alternative and is the
 * wrong one: the board is live, and re-reading fifty orders to record that one
 * number moved would let a stale response overwrite a status that arrived on
 * the socket while the request was in flight.
 */
export function OrderReminderDialog({
  t,
  order,
  onSet,
}: {
  t: Translate;
  order: StaffOrder;
  onSet: (reminder: OrderReminder) => void;
}) {
  const { language } = useLanguage();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeded on every open rather than once: the board polls, and a dialog opened
  // twice around a colleague's change would otherwise offer the old number back
  // as if nothing had happened.
  useEffect(() => {
    if (open) {
      setValue(order.reminderLeadMin === null ? '' : String(order.reminderLeadMin));
      setError(null);
    }
  }, [open, order.reminderLeadMin]);

  const minutes = reminderLead(value);
  // Only while what is typed is a number. A preview that kept showing the last
  // valid time would be describing a warning nobody is about to set.
  const preview =
    minutes === null || order.readyAt === null
      ? null
      : formatDateTime(reminderFiresAt(order.readyAt, minutes), language);

  const save = async (): Promise<void> => {
    if (minutes === null) {
      return;
    }
    setBusy(true);
    try {
      const reminder = await api.setOrderReminder(order.id, minutes);
      onSet(reminder);
      toast.success(
        t('orderReminderSaved', { code: order.pickupCode, minutes: reminder.reminderLeadMin }),
      );
      setOpen(false);
    } catch (err) {
      setError(errorText(t, err, 'errorSetReminder'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('orderReminderTitle', { code: order.pickupCode })}
      description={t('orderReminderDesc')}
      trigger={<Button icon="clock">{reminderLabel(t, order)}</Button>}
    >
      <DialogBody>
        {error !== null && <Banner>{error}</Banner>}

        <Field
          label={t('orderReminderLabel')}
          hint={t('orderReminderHint', {
            min: REMINDER_LEAD_MIN_MINUTES,
            max: REMINDER_LEAD_MAX_MINUTES,
          })}
          // Only once something has been typed and it is wrong. Opening on an
          // error message would be telling somebody off for not having started.
          error={value !== '' && minutes === null ? t('orderReminderInvalid') : undefined}
        >
          {(id) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('orderReminderPlaceholder')}
              disabled={busy}
            />
          )}
        </Field>

        <div className="reminder__facts">
          {/* What the estimate said, so the number being overridden is visible
              next to the override. Absent on orders placed before pre-ordering
              existed, which recorded no estimate — and a card that invented one
              would be claiming a promise nobody made. */}
          {order.prepMin !== null && (
            <p className="muted">{t('orderReminderPrep', { minutes: order.prepMin })}</p>
          )}
          {preview !== null && (
            <p className="reminder__preview">{t('orderReminderPreview', { when: preview })}</p>
          )}
        </div>
      </DialogBody>

      <DialogFooter>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          {t('orderReminderCancel')}
        </Button>
        <Button
          variant="primary"
          // The same condition the preview is drawn from, so a save that would
          // 422 cannot be pressed.
          disabled={minutes === null || busy}
          loading={busy}
          onClick={() => void save()}
        >
          {t('orderReminderSave')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
