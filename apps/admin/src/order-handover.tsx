import { useEffect, useState } from 'react';
import { OrderStatus, PICKUP_CODE_LENGTH, PICKUP_CODE_PATTERN } from '@amragrir/shared';
import { api, errorText, isWrongPickupCode, type StaffOrder } from './api';
import type { Translate } from './language';
import { Banner, Button, Dialog, DialogBody, DialogFooter, Field, TextInput } from './ui';

/**
 * Handing the food over.
 *
 * `ready -> completed` is the one move on this board that is not a statement
 * about the kitchen. Every other button says what the restaurant has done;
 * this one says the order left the counter in somebody's hands, and the only
 * evidence of that is the code they showed.
 *
 * So it is a dialog with a box in it rather than a button. The board used to
 * mark an order collected on one press — and print the collection code across
 * the top of the card, so the press needed nobody to be standing there. Both
 * halves are gone: the card no longer carries the code (the API does not send
 * it), and the move no longer goes through without it.
 *
 * **The check is the API's.** This types six digits into a request; the panel
 * has nothing to compare them against and is not trusted to. What it does have
 * is the wording — a wrong code is the ordinary outcome of a mistyped digit,
 * several times a shift, and it belongs beside the box in the shift's own
 * language rather than as whatever sentence a 422 carried.
 */

/** The code as the API will take it, or null while what is typed is not one
 *  yet. Same shape the DTO validates against, from the same constant — a box
 *  that submitted five digits would be a person typing them twice. */
export function handoverCode(raw: string): string | null {
  const code = raw.trim();
  return PICKUP_CODE_PATTERN.test(code) ? code : null;
}

export function OrderHandoverDialog({
  t,
  order,
  busy,
  onDone,
}: {
  t: Translate;
  order: StaffOrder;
  busy: boolean;
  /** Runs after the API has accepted the handover. The board updates from the
   *  broadcast the move triggers, so this only announces it. */
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleared on every open. A dialog reopened after a refusal would otherwise
  // offer the rejected digits back as if they were worth submitting again —
  // and the next guest is a different guest.
  useEffect(() => {
    if (open) {
      setValue('');
      setError(null);
    }
  }, [open]);

  const code = handoverCode(value);

  const confirm = async (): Promise<void> => {
    if (code === null) {
      return;
    }
    setPending(true);
    try {
      await api.setOrderStatus(order.id, OrderStatus.Completed, code);
      onDone();
      setOpen(false);
    } catch (err) {
      // The one API failure this panel rewords. Everything else — an order
      // somebody else already collected, a lost connection — is shown as sent.
      setError(isWrongPickupCode(err) ? t('orderHandoverWrong') : errorText(t, err, 'errorUpdateOrder'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('orderHandoverTitle', { code: order.code })}
      description={t('orderHandoverDesc')}
      trigger={
        <Button variant="primary" className="btn--touch" disabled={busy}>
          {t('orderHandoverAction')}
        </Button>
      }
    >
      <DialogBody>
        {error !== null && <Banner>{error}</Banner>}

        <Field
          label={t('orderHandoverLabel')}
          hint={t('orderHandoverHint', { digits: PICKUP_CODE_LENGTH })}
          // Only once something has been typed and it is the wrong shape.
          // Opening on an error would be telling somebody off for not having
          // started, and a half-typed code is not a wrong one yet.
          error={
            value !== '' && code === null
              ? t('orderHandoverInvalid', { digits: PICKUP_CODE_LENGTH })
              : undefined
          }
        >
          {(id) => (
            <TextInput
              id={id}
              // `inputMode` and not `type="number"`: the code has leading zeros
              // and is not a quantity, and a spinner on it would be nonsense.
              // A wedge scanner pointed at the guest's QR types straight in
              // here — which is the fast path, and it needs no code of its own.
              inputMode="numeric"
              autoComplete="off"
              // The counter's hands are on the guest, not the keyboard. Radix
              // focuses the first focusable child on open, and this is it.
              autoFocus
              maxLength={PICKUP_CODE_LENGTH}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              // A scanner ends its scan with Enter, so the whole handover is
              // one gesture: point, and the order closes.
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void confirm();
                }
              }}
              placeholder={t('orderHandoverPlaceholder')}
              disabled={pending}
            />
          )}
        </Field>
      </DialogBody>

      <DialogFooter>
        <Button onClick={() => setOpen(false)} disabled={pending}>
          {t('orderHandoverCancel')}
        </Button>
        <Button
          variant="primary"
          // The same condition the field is checked against, so a request the
          // API would refuse on its shape alone cannot be sent.
          disabled={code === null || pending}
          loading={pending}
          onClick={() => void confirm()}
        >
          {t('orderHandoverConfirm')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
