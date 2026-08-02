import { useState } from 'react';
import { api, errorText, type ActingAs } from './api';
import { useT } from './i18n';
import { Button, ConfirmDialog, useToast } from './ui';

/**
 * The panel's half of signing in as somebody else.
 *
 * `acting` in `api.ts` owns the session — stashing the super admin's own tokens
 * and swapping them back. This owns the *decision* and the control, because two
 * screens offer it and each shows a different shape of row: the People directory
 * lists people with their roles hanging off them, and a restaurant's teams list
 * roles with the person hanging off each. Written once here, both get the same
 * rules and the same button.
 */

/**
 * What a screen needs to offer a way into somebody's account.
 *
 * **Null is the "may not" case**, rather than a separate boolean beside it —
 * there is no meaningful state where a screen has the capability and is not
 * allowed to use it, and one nullable object threads through four levels of
 * props where three flags would have to be kept in step at each.
 *
 * The shell passes null for any account without `staff:impersonate`, and also
 * for a super admin already acting as somebody: impersonation does not chain,
 * and offering a button the API will refuse is worse than not offering it.
 */
export interface Acting {
  /** The signed-in account's own id — the one card whose button would do
   *  nothing. */
  selfId: string | null;
  begin: (who: ActingAs, accessToken: string) => void;
}

/**
 * Whether this person's row offers a way into their account.
 *
 * Every clause mirrors a refusal `ImpersonationService` also makes, so the
 * button is absent rather than present and 403ing:
 *
 * - **`acting` is null** — the account holds no `staff:impersonate`, or is
 *   already acting as somebody.
 * - **Not yourself** — you are already signed in as you, and the token this
 *   returns has no refresh half, so it would be a strictly worse session.
 * - **Not deactivated** — an account nobody may be, including a super admin.
 * - **Holds a role** — a token over no roles is a panel where every screen
 *   403s, which is a worse answer than not offering the door.
 *
 * `holdsARole` rather than a list of them, because the two screens know it two
 * different ways: the directory counts the roles on a person, while a team row
 * *is* a role and so answers yes by construction.
 */
export function mayActAs(
  person: { id: string; isActive: boolean; holdsARole: boolean },
  acting: Acting | null,
): boolean {
  return acting !== null && person.id !== acting.selfId && person.isActive && person.holdsARole;
}

/**
 * The button, and the confirmation in front of it.
 *
 * Renders nothing where it would not work, so callers place it unconditionally
 * and the rules stay in one place. It owns its own busy flag rather than taking
 * the screen's: the surrounding rows have their own actions, and a person's
 * roles being revoked elsewhere on the page has nothing to do with whether this
 * one is mid-flight.
 */
export function ActAsButton({
  person,
  acting,
}: {
  person: { id: string; name: string; email: string; isActive: boolean; holdsARole: boolean };
  acting: Acting | null;
}) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // After the hooks, never before: an early return above them would change how
  // many run between renders the moment somebody starts or stops acting.
  if (acting === null || !mayActAs(person, acting)) {
    return null;
  }

  const go = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await api.impersonate(person.id);
      // Not cleared on success: the panel is about to swap sessions and remount
      // this screen, so the only state update left would be on a component that
      // is going away.
      acting.begin(
        { id: result.staff.id, name: result.staff.name, email: result.staff.email },
        result.accessToken,
      );
    } catch (err) {
      toast.error(errorText(t, err, 'errorActAs'));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      title={t('actAsTitle', { name: person.name })}
      description={t('actAsDesc')}
      confirmLabel={t('actAsConfirm')}
      busy={busy}
      onConfirm={() => void go()}
      trigger={
        <Button icon="signOut" size="sm" disabled={busy}>
          {t('actAs')}
        </Button>
      }
    />
  );
}
