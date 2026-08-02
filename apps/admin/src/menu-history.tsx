import { useEffect, useState } from 'react';
import { AuditAction, Language } from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import { api, errorText, type MenuHistoryEntry } from './api';
import { formatAmd, formatDateTime, pickLabel } from './format';
import { useLanguage } from './i18n';
import type { Translate } from './language';
import { routePath } from './navigation';
import { Link } from './router';
import { Banner, Dialog, DialogBody, EmptyState, IconButton, Skeleton } from './ui';

/**
 * What a dish's price used to be, and whose decision it was.
 *
 * The Menu screen is a list of current values: this is the price today, this is
 * whether it is on sale today. Every one of those cells is an UPDATE that
 * overwrote the previous answer, so "who put this on the menu", "what did it
 * cost last week" and "which of the two managers marked it sold out on Saturday"
 * had no answer on screen — even though the API has recorded all three to
 * `audit_log`, inside the transaction that made each change, since the table
 * existed.
 *
 * A dialog per row rather than a column, for the reason the order board's
 * History is one: a timeline is something you open about one thing, read, and
 * close. Fifty dishes each carrying their own timeline is a page nobody can
 * read, and a request per row for panels nobody opened.
 */

/** How one field moved. `from`/`to` are already formatted for reading — a price
 *  grouped in dram, a tab as its translated name — and null means there was no
 *  value on that side, which is different from an empty one. */
export interface MenuChange {
  /** The field's own name, translated. Falls back to the raw key for a field a
   *  newer API records and this build has no label for — ugly and honest beats
   *  a change that silently vanishes from an audit trail. */
  label: string;
  from: string | null;
  to: string | null;
}

/**
 * The dish's editable fields, as dictionary keys.
 *
 * Every key `changedFields` can put in an entry is here. A field missing from
 * this map still renders, under its raw name — see `MenuChange.label`.
 */
const FIELD_LABEL: Readonly<Record<string, AdminTranslationKey>> = {
  nameI18n: 'menuField_name',
  descI18n: 'menuField_desc',
  priceAmd: 'menuField_price',
  menuTab: 'menuField_tab',
  categoryId: 'menuField_category',
  caloriesKcal: 'menuField_calories',
  prepMin: 'menuField_prep',
  photoUrl: 'menuField_photo',
  dietaryTags: 'menuField_tags',
  isAvailable: 'menuField_available',
};

/**
 * One recorded value, as something a person can read.
 *
 * The values come out of a JSON column written by whichever build was deployed
 * when the change happened, so every branch here checks the shape rather than
 * casting: an entry from an older API can carry a field this one types
 * differently, and a timeline that throws is worse than one that says "set".
 *
 * A uuid and a photo URL are deliberately *not* shown. Neither is readable, and
 * "the category changed from 8f3c… to b210…" answers nothing the reader asked;
 * that a category was set at all is the part they can act on.
 */
export function formatValue(
  t: Translate,
  field: string,
  value: unknown,
  language: Language,
): string {
  if (value === null || value === undefined) {
    return t('menuHistoryValueNone');
  }

  switch (field) {
    case 'priceAmd':
      return typeof value === 'number' ? formatAmd(value) : String(value);
    case 'isAvailable':
      return value === true ? t('menuAvailableYes') : t('menuAvailableNo');
    case 'menuTab':
      return typeof value === 'string' ? t(`menuTab_${value}` as AdminTranslationKey) : String(value);
    case 'nameI18n':
    case 'descI18n':
      return typeof value === 'object'
        ? pickLabel(value as Record<string, string>, language) || t('menuHistoryValueNone')
        : String(value);
    case 'prepMin':
      return typeof value === 'number' ? t('menuPrepMin', { minutes: value }) : String(value);
    case 'caloriesKcal':
      return typeof value === 'number' ? t('menuHistoryKcal', { kcal: value }) : String(value);
    case 'dietaryTags':
      return Array.isArray(value) && value.length > 0
        ? value.join(', ')
        : t('menuHistoryValueNone');
    // A uuid, and a URL nobody reads. That there is one is the readable part.
    case 'categoryId':
    case 'photoUrl':
      return t('menuHistoryValueSet');
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/**
 * What one entry actually moved.
 *
 * **The keys of `after` are the diff**, not the keys of `before`. The API adds
 * the dish's name to `before` on every edit as a label — so an entry that
 * changed only a price carries `nameI18n` on one side, and iterating the wrong
 * object would render "Name: Khorovats → not set" on every price change in the
 * timeline.
 *
 * The two ends of a dish's life have no pair to diff and are not made to look
 * like one: a creation lists what it went on the menu at, with nothing on the
 * left, and a withdrawal lists what it was, with nothing on the right.
 */
export function changesOf(
  t: Translate,
  entry: MenuHistoryEntry,
  language: Language,
): MenuChange[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};

  const label = (field: string): string => {
    const key = FIELD_LABEL[field];
    return key === undefined ? field : t(key);
  };

  if (entry.action === AuditAction.MenuItemCreate) {
    return Object.keys(after).map((field) => ({
      label: label(field),
      from: null,
      to: formatValue(t, field, after[field], language),
    }));
  }

  if (entry.action === AuditAction.MenuItemDelete) {
    return Object.keys(before).map((field) => ({
      label: label(field),
      from: formatValue(t, field, before[field], language),
      to: null,
    }));
  }

  return Object.keys(after).map((field) => ({
    label: label(field),
    from: formatValue(t, field, before[field], language),
    to: formatValue(t, field, after[field], language),
  }));
}

/**
 * What the entry says happened, in one line.
 *
 * Without the dish's name in it, unlike the same sentence in the activity feed:
 * that one is read across every dish in a restaurant and has to say which, while
 * this dialog is titled with the dish and would otherwise repeat it on every
 * row.
 *
 * A price change says so rather than reading as a plain edit. It is what this
 * dialog gets opened for, and the diff underneath is scanned second.
 */
export function headline(t: Translate, entry: MenuHistoryEntry): string {
  switch (entry.action) {
    case AuditAction.MenuItemCreate:
      return t('menuHistoryCreated');
    case AuditAction.MenuItemUpdate:
      return entry.after?.priceAmd === undefined
        ? t('menuHistoryEdited')
        : t('menuHistoryPriceChanged');
    case AuditAction.MenuItemAvailability:
      return entry.after?.isAvailable === true
        ? t('menuHistoryBackOnSale')
        : t('menuHistorySoldOut');
    case AuditAction.MenuItemDelete:
      return t('menuHistoryDeleted');
    default:
      // An action the API records and this build has no sentence for — a panel
      // deployed behind the API. The raw verb is ugly and honest; the
      // alternative is an entry that disappears out of an audit trail.
      return t('activityUnknown', { action: entry.action });
  }
}

/**
 * Where the person named on an entry leads, or null when nowhere.
 *
 * Null in three situations that all end with the name as plain text: nobody was
 * recorded, the account has since been deleted (`ON DELETE SET NULL` — the entry
 * outlives the actor), or this account cannot open the People directory. A shift
 * holds `menu:read` and not `staff:read`, so for them every name here is text.
 */
export function actorHref(entry: MenuHistoryEntry, canOpenStaff: boolean): string | null {
  return canOpenStaff && entry.actor.id !== null
    ? routePath({ tab: 'People', person: entry.actor.id })
    : null;
}

/** The impersonator — the super admin really at the keyboard. Always a staff
 *  link: only staff can be impersonated, and only staff do the impersonating. */
export function impersonatorHref(
  entry: MenuHistoryEntry,
  canOpenStaff: boolean,
): string | null {
  return canOpenStaff && entry.actor.impersonatedById !== null
    ? routePath({ tab: 'People', person: entry.actor.impersonatedById })
    : null;
}

/**
 * Everything recorded about one dish.
 *
 * Fetched when the dialog opens, and again on every open: a price moves while
 * the panel is looking at another branch, and a timeline held from the last time
 * is wrong exactly when somebody is checking it.
 */
export function MenuHistoryDialog({
  itemId,
  dish,
  canOpenStaff,
}: {
  itemId: string;
  /** The dish's name as the panel currently shows it — the dialog's title. The
   *  entries carry their own names, which is what makes a rename readable. */
  dish: string;
  canOpenStaff: boolean;
}) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<MenuHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let live = true;
    setEntries(null);
    setError(null);

    api
      .menuHistory(itemId)
      .then((result) => {
        if (live) {
          setEntries(result.items);
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setError(errorText(t, err, 'errorLoadHistory'));
        }
      });

    // Closing mid-request must not land its answer in a dialog that is no
    // longer open — or, worse, in the next dish's.
    return () => {
      live = false;
    };
  }, [open, itemId, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('menuHistoryTitle', { dish })}
      description={t('menuHistoryDesc')}
      // Wide, because an entry is a sentence with a name, a time and a diff
      // under it. At the default width the `from → to` pairs wrap.
      wide
      trigger={
        <IconButton icon="history" label={t('menuHistoryOpen', { dish })} />
      }
    >
      <DialogBody>
        {error !== null ? (
          <Banner>{error}</Banner>
        ) : entries === null ? (
          <Skeleton count={3} height={52} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="history"
            title={t('menuHistoryEmptyTitle')}
            description={t('menuHistoryEmptyDesc')}
          />
        ) : (
          <ol className="timeline">
            {entries.map((entry) => {
              const changes = changesOf(t, entry, language);
              const to = actorHref(entry, canOpenStaff);
              const actingTo = impersonatorHref(entry, canOpenStaff);
              return (
                <li key={entry.id} className="timeline__entry">
                  {/* Decorative: the running order is carried by the list, and
                      reading "bullet" before every entry is noise. */}
                  <span className="timeline__mark" aria-hidden="true" />
                  <div className="timeline__body">
                    <div className="row spread">
                      <span className="timeline__what">{headline(t, entry)}</span>
                      <time className="timeline__at" dateTime={entry.at}>
                        {formatDateTime(entry.at, language)}
                      </time>
                    </div>

                    <p className="timeline__who">
                      {/* A missing name is said out loud rather than left
                          blank: the actor column is ON DELETE SET NULL, so
                          "somebody whose account is gone" is a real answer and
                          an empty line would read as a rendering bug. */}
                      {entry.actor.name === null ? (
                        t('historyByStaffGone')
                      ) : to === null ? (
                        <span className="strong">{entry.actor.name}</span>
                      ) : (
                        <Link
                          to={to}
                          className="timeline__who-link"
                          // The tooltip, not the accessible name: what a screen
                          // reader should read out is the person, which is what
                          // the text already says.
                          title={t('historyOpenStaff')}
                        >
                          {entry.actor.name}
                        </Link>
                      )}
                      {entry.actor.impersonatedBy !== null && (
                        <span className="timeline__acting">
                          {' · '}
                          {actingTo === null ? (
                            t('historyImpersonatedBy', { name: entry.actor.impersonatedBy })
                          ) : (
                            <Link
                              to={actingTo}
                              className="timeline__who-link"
                              title={t('historyOpenStaff')}
                            >
                              {t('historyImpersonatedBy', { name: entry.actor.impersonatedBy })}
                            </Link>
                          )}
                        </span>
                      )}
                    </p>

                    {changes.length > 0 && (
                      <dl className="diff">
                        {changes.map((change) => (
                          <div className="diff__row" key={change.label}>
                            <dt className="diff__field">{change.label}</dt>
                            <dd className="diff__values">
                              {change.from !== null && (
                                <span className="diff__from">{change.from}</span>
                              )}
                              {change.from !== null && change.to !== null && (
                                <span className="diff__arrow" aria-hidden="true">
                                  {' → '}
                                </span>
                              )}
                              {change.to !== null && <span className="diff__to">{change.to}</span>}
                            </dd>
                          </div>
                        ))}
                      </dl>
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
