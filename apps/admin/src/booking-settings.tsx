import { useCallback, useEffect, useState } from 'react';
import {
  api,
  conflictsIn,
  errorText,
  type BookingConflict,
  type PolicySource,
  type BookingPolicyFields,
  type BookingPolicyView,
  type BookingPreview,
  type StaffClosure,
  type StaffTable,
  type WeeklyHours,
} from './api';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import type { Translate } from './language';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  Field,
  IconButton,
  Spinner,
  Switch,
  TextInput,
} from './ui';
import {
  draftFromHours,
  hoursFromDraft,
  hoursProblem,
  isBooleanField,
  isCalendarDate,
  overrideToggle,
  parsePolicyNumber,
  policyRows,
  runsPastMidnight,
  todayInYerevan,
  type DayRow,
  type PolicyField,
  type Weekday,
} from './booking-model';

/**
 * Which dictionary entry names each thing.
 *
 * Written out as maps rather than built as `bookingField_${field}`, so the
 * compiler checks every key against the dictionary. A computed key is a key
 * nothing verifies, and a missing one renders as itself — which is how a panel
 * ends up with `bookingField_slotMinutes` printed on a form.
 */
const FIELD_LABEL: Record<PolicyField, AdminTranslationKey> = {
  seatingMinutes: 'bookingFieldSeating',
  slotMinutes: 'bookingFieldSlot',
  maxGuests: 'bookingFieldMaxGuests',
  maxLeadDays: 'bookingFieldMaxLead',
  minLeadMinutes: 'bookingFieldMinLead',
  depositPerGuestAmd: 'bookingFieldDeposit',
  freeCancelHours: 'bookingFieldFreeCancel',
  autoConfirm: 'bookingFieldAutoConfirm',
};

const SOURCE_LABEL: Record<PolicySource, AdminTranslationKey> = {
  branch: 'bookingSourceBranch',
  restaurant: 'bookingSourceRestaurant',
  platform: 'bookingSourcePlatform',
};

const WEEKDAY_LABEL: Record<Weekday, AdminTranslationKey> = {
  mon: 'weekdayMon',
  tue: 'weekdayTue',
  wed: 'weekdayWed',
  thu: 'weekdayThu',
  fri: 'weekdayFri',
  sat: 'weekdaySat',
  sun: 'weekdaySun',
};

const REASON_LABEL: Record<BookingConflict['reason'], AdminTranslationKey> = {
  table_gone: 'bookingReasonTableGone',
  table_too_small: 'bookingReasonTableTooSmall',
  day_closed: 'bookingReasonDayClosed',
  outside_hours: 'bookingReasonOutsideHours',
};

/**
 * How this branch takes bookings — the room, the hours, the days off, and the
 * numbers behind the offer.
 *
 * Everything here was in the database from stage one and reachable over HTTP
 * from stage two; this is the first time a person can change it. Which is the
 * whole point of the screen: a restaurant could not previously enter its own
 * tables, so `GET /availability` answered with nothing and table booking did
 * not work in production at all.
 *
 * **Loaded only when somebody opens it.** A chain's card carries every branch
 * under it, and four requests apiece across seventy-eight branches is a page
 * that spends ten seconds fetching settings nobody asked to see.
 *
 * **Every narrowing save can be refused.** The API answers `409` with the
 * bookings the change would strand; this shows them and offers to go ahead
 * anyway. Going ahead saves the setting and cancels nothing — somebody still
 * has to ring those people, and the dialog says so.
 */

interface Props {
  t: Translate;
  branchId: string;
  branchName: string;
  /** Tables and the policy — a manager's decision. */
  canWrite: boolean;
  /** The hours and the days off — a shift's, because closing tomorrow because
   *  the freezer died happens at 6pm and cannot wait for a manager. */
  canSetHours: boolean;
}

interface ConflictPrompt {
  conflicts: BookingConflict[];
  retry: () => Promise<void>;
}

export function BookingSettings({ t, branchId, branchName, canWrite, canSetHours }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tables, setTables] = useState<StaffTable[] | null>(null);
  const [closures, setClosures] = useState<StaffClosure[] | null>(null);
  const [policy, setPolicy] = useState<BookingPolicyView | null>(null);
  const [hours, setHours] = useState<WeeklyHours | null | undefined>(undefined);
  const [conflict, setConflict] = useState<ConflictPrompt | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tableList, closureList, policyView] = await Promise.all([
        api.tables(branchId),
        api.closures(branchId),
        api.branchPolicy(branchId),
      ]);
      setTables(tableList.items);
      setClosures(closureList.items);
      setPolicy(policyView);
    } catch (err) {
      setError(errorText(t, err, 'errorUpdateBranch'));
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    if (open && tables === null) {
      void load();
    }
  }, [open, tables, load]);

  /**
   * Runs a save, and turns a refusal into the list rather than into a message.
   *
   * The retry it stores closes over `force: true`, so pressing "save anyway" in
   * the dialog repeats exactly the request that was refused rather than
   * rebuilding it from state that may have moved.
   */
  const guarded = async (run: (force: boolean) => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await run(false);
    } catch (err) {
      const conflicts = conflictsIn(err);
      if (conflicts) {
        setConflict({
          conflicts,
          retry: async () => {
            setBusy(true);
            try {
              await run(true);
            } catch (retryErr) {
              setError(errorText(t, retryErr, 'errorUpdateBranch'));
            } finally {
              setBusy(false);
              setConflict(null);
            }
          },
        });
      } else {
        setError(errorText(t, err, 'errorUpdateBranch'));
      }
    } finally {
      setBusy(false);
    }
  };

  const plain = async (run: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (err) {
      setError(errorText(t, err, 'errorUpdateBranch'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="branch__setting">
      <div className="row row--between">
        <span className="strong">{t('bookingSettingsTitle')}</span>
        <Button variant="secondary" onClick={() => setOpen((was) => !was)}>
          {open ? t('bookingSettingsHide') : t('bookingSettingsOpen')}
        </Button>
      </div>

      {!open && <p className="faint">{t('bookingSettingsHint')}</p>}

      {open && loading && <Spinner />}
      {open && error !== null && <p className="booking__warn">{error}</p>}

      {open && !loading && tables !== null && policy !== null && closures !== null && (
        <div className="booking">
          <Tables
            t={t}
            tables={tables}
            disabled={!canWrite || busy}
            onAdd={(table) =>
              void plain(async () => {
                await api.createTable(branchId, table);
                setTables((await api.tables(branchId)).items);
              })
            }
            onChange={(id, patch) =>
              void guarded(async (force) => {
                await api.updateTable(id, patch, force);
                setTables((await api.tables(branchId)).items);
              })
            }
          />

          <Hours
            t={t}
            stored={hours === undefined ? null : hours}
            initialised={hours !== undefined}
            disabled={!canSetHours || busy}
            onLoad={setHours}
            onSave={(next) =>
              void guarded(async (force) => {
                const saved = await api.bookingHours(branchId, next, force);
                setHours(saved.bookingHours);
              })
            }
          />

          <Closures
            t={t}
            closures={closures}
            disabled={!canSetHours || busy}
            onAdd={(closure) =>
              void guarded(async (force) => {
                await api.createClosure(branchId, closure, force);
                setClosures((await api.closures(branchId)).items);
              })
            }
            onRemove={(id) =>
              void plain(async () => {
                await api.deleteClosure(id);
                setClosures((await api.closures(branchId)).items);
              })
            }
          />

          <Policy
            t={t}
            view={policy}
            disabled={!canWrite || busy}
            onPatch={(patch) =>
              void plain(async () => {
                setPolicy(await api.setBranchPolicy(branchId, patch));
              })
            }
          />

          <Preview t={t} branchId={branchId} version={`${tables.length}-${busy}`} />
        </div>
      )}

      {conflict !== null && (
        <ConflictDialog
          t={t}
          branchName={branchName}
          conflicts={conflict.conflicts}
          onCancel={() => setConflict(null)}
          onConfirm={() => void conflict.retry()}
        />
      )}
    </div>
  );
}

// ── the room ────────────────────────────────────────────────────────────────

function Tables({
  t,
  tables,
  disabled,
  onAdd,
  onChange,
}: {
  t: Translate;
  tables: StaffTable[];
  disabled: boolean;
  onAdd: (table: { tableNo: string; seats: number; zone?: string }) => void;
  onChange: (id: string, patch: { seats?: number; isActive?: boolean }) => void;
}) {
  const [tableNo, setTableNo] = useState('');
  const [seats, setSeats] = useState('2');
  const [zone, setZone] = useState('');

  const seatCount = parsePolicyNumber(seats, { min: 1, max: 200 });
  const canAdd = tableNo.trim() !== '' && seatCount !== null && !disabled;

  return (
    <section className="booking__block">
      <h4 className="booking__heading">{t('bookingTablesTitle')}</h4>
      <p className="faint">{t('bookingTablesHint')}</p>

      {tables.length === 0 ? (
        // The state every restaurant starts in, and the reason bookings did not
        // work: with no tables there is nothing to hold, so the calendar is
        // empty and nothing explains why.
        <p className="booking__warn">{t('bookingTablesNone')}</p>
      ) : (
        <ul className="booking__tables">
          {tables.map((table) => (
            <li key={table.id} className="booking__table">
              <span className="strong">{table.tableNo}</span>
              <span className="faint">{t('bookingSeats', { count: table.seats })}</span>
              <span className="faint">{table.zone ?? '—'}</span>
              {table.upcomingBookings > 0 && (
                <Badge tone="accent">
                  {t('bookingUpcoming', { count: table.upcomingBookings })}
                </Badge>
              )}
              <Switch
                checked={table.isActive}
                disabled={disabled}
                ariaLabel={t('bookingTableActiveLabel', { table: table.tableNo })}
                onCheckedChange={(on) => onChange(table.id, { isActive: on })}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="booking__add">
        <Field label={t('bookingTableNo')}>
          {(id) => (
            <TextInput
              id={id}
              value={tableNo}
              maxLength={10}
              disabled={disabled}
              onChange={(event) => setTableNo(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('bookingSeatsLabel')}>
          {(id) => (
            <TextInput
              id={id}
              value={seats}
              inputMode="numeric"
              disabled={disabled}
              onChange={(event) => setSeats(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('bookingZone')}>
          {(id) => (
            <TextInput
              id={id}
              value={zone}
              maxLength={40}
              disabled={disabled}
              onChange={(event) => setZone(event.target.value)}
            />
          )}
        </Field>
        <Button
          disabled={!canAdd}
          onClick={() => {
            onAdd({
              tableNo: tableNo.trim(),
              seats: seatCount ?? 1,
              ...(zone.trim() === '' ? {} : { zone: zone.trim() }),
            });
            setTableNo('');
            setZone('');
          }}
        >
          {t('bookingAddTable')}
        </Button>
      </div>
      <p className="faint">{t('bookingHallHint')}</p>
    </section>
  );
}

// ── when tables are held ────────────────────────────────────────────────────

function Hours({
  t,
  stored,
  initialised,
  disabled,
  onLoad,
  onSave,
}: {
  t: Translate;
  stored: WeeklyHours | null;
  initialised: boolean;
  disabled: boolean;
  onLoad: (hours: WeeklyHours | null) => void;
  onSave: (hours: WeeklyHours | null) => void;
}) {
  const [rows, setRows] = useState<DayRow[]>(() => draftFromHours(stored));
  const [own, setOwn] = useState(stored !== null);

  // The branch card already holds the stored value; this only mirrors it once,
  // so editing does not fight the parent on every keystroke.
  useEffect(() => {
    if (initialised) {
      setRows(draftFromHours(stored));
      setOwn(stored !== null);
    }
  }, [initialised, stored]);

  useEffect(() => {
    if (!initialised) {
      onLoad(stored);
    }
  }, [initialised, stored, onLoad]);

  const problem = hoursProblem(rows);

  return (
    <section className="booking__block">
      <div className="row row--between">
        <h4 className="booking__heading">{t('bookingHoursTitle')}</h4>
        <span className="row row--tight">
          <span className="faint">{t('branchDecidesItself')}</span>
          <Switch
            checked={own}
            disabled={disabled}
            ariaLabel={t('bookingHoursOwnLabel')}
            // On: start from the kitchen's hours, so taking the decision over
            // changes nothing by itself. Off: hand it straight back.
            onCheckedChange={(on) => {
              setOwn(on);
              if (!on) {
                onSave(null);
              }
            }}
          />
        </span>
      </div>
      <p className="faint">{own ? t('bookingHoursHint') : t('bookingHoursFollows')}</p>

      {own && (
        <>
          <ul className="booking__hours">
            {rows.map((row, index) => (
              <li key={row.day} className="booking__day">
                <span className="strong">{t(WEEKDAY_LABEL[row.day])}</span>
                <Switch
                  checked={row.open}
                  disabled={disabled}
                  ariaLabel={t('bookingDayOpenLabel', { day: t(WEEKDAY_LABEL[row.day]) })}
                  onCheckedChange={(on) =>
                    setRows(rows.map((each, at) => (at === index ? { ...each, open: on } : each)))
                  }
                />
                {row.open ? (
                  <>
                    <TextInput
                      className="booking__time"
                      value={row.from}
                      disabled={disabled}
                      aria-label={t('bookingFrom')}
                      onChange={(event) =>
                        setRows(
                          rows.map((each, at) =>
                            at === index ? { ...each, from: event.target.value } : each,
                          ),
                        )
                      }
                    />
                    <TextInput
                      className="booking__time"
                      value={row.to}
                      disabled={disabled}
                      aria-label={t('bookingTo')}
                      onChange={(event) =>
                        setRows(
                          rows.map((each, at) =>
                            at === index ? { ...each, to: event.target.value } : each,
                          ),
                        )
                      }
                    />
                    {/* Said out loud, so "22:00–02:00" does not read as a
                        mistake somebody is about to "fix". */}
                    {runsPastMidnight(row) && (
                      <span className="faint">{t('bookingPastMidnight')}</span>
                    )}
                  </>
                ) : (
                  <span className="faint">{t('bookingDayClosed')}</span>
                )}
              </li>
            ))}
          </ul>

          {problem !== null && (
            <p className="booking__warn">
              {t('bookingHoursBadDay', { day: t(WEEKDAY_LABEL[problem]) })}
            </p>
          )}

          <Button
            disabled={disabled || problem !== null}
            onClick={() => onSave(hoursFromDraft(rows))}
          >
            {t('bookingSaveHours')}
          </Button>
        </>
      )}
    </section>
  );
}

// ── days that are not like the others ───────────────────────────────────────

function Closures({
  t,
  closures,
  disabled,
  onAdd,
  onRemove,
}: {
  t: Translate;
  closures: StaffClosure[];
  disabled: boolean;
  onAdd: (closure: {
    date: string;
    kind: 'closed' | 'custom_hours';
    open?: string;
    close?: string;
    reason?: string;
  }) => void;
  onRemove: (id: string) => void;
}) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');

  return (
    <section className="booking__block">
      <h4 className="booking__heading">{t('bookingClosuresTitle')}</h4>
      <p className="faint">{t('bookingClosuresHint')}</p>

      {closures.length === 0 ? (
        <p className="faint">{t('bookingClosuresNone')}</p>
      ) : (
        <ul className="booking__closures">
          {closures.map((closure) => (
            <li key={closure.id} className="booking__closure">
              <span className="strong">{closure.date}</span>
              <span className="faint">
                {closure.kind === 'closed'
                  ? t('bookingDayClosed')
                  : `${closure.open ?? ''}–${closure.close ?? ''}`}
              </span>
              {/* Shown back, because "closed" with no reason attached is a row
                  nobody dares delete. */}
              <span className="faint">{closure.reason ?? '—'}</span>
              <IconButton
                icon="trash"
                label={t('bookingRemoveClosure', { date: closure.date })}
                disabled={disabled}
                onClick={() => onRemove(closure.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="booking__add">
        <Field label={t('bookingClosureDate')}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={date}
              min={todayInYerevan()}
              disabled={disabled}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('bookingClosureReason')}>
          {(id) => (
            <TextInput
              id={id}
              value={reason}
              maxLength={200}
              disabled={disabled}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        <Button
          disabled={disabled || !isCalendarDate(date)}
          onClick={() => {
            onAdd({
              date,
              kind: 'closed',
              ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
            });
            setDate('');
            setReason('');
          }}
        >
          {t('bookingAddClosure')}
        </Button>
      </div>
    </section>
  );
}

// ── the numbers ─────────────────────────────────────────────────────────────

function Policy({
  t,
  view,
  disabled,
  onPatch,
}: {
  t: Translate;
  view: BookingPolicyView;
  disabled: boolean;
  onPatch: (patch: Partial<BookingPolicyFields>) => void;
}) {
  const rows = policyRows(view);

  return (
    <section className="booking__block">
      <h4 className="booking__heading">{t('bookingPolicyTitle')}</h4>
      <p className="faint">{t('bookingPolicyHint')}</p>

      <ul className="booking__policy">
        {rows.map((row) => (
          <li key={row.field} className="booking__field">
            <span className="strong">{t(policyLabel(row.field))}</span>

            {/* Which level answered, said plainly. Without it a manager cannot
                tell a deliberate 90 from an inherited one, sets it again to be
                sure, and the branch stops following the chain forever. */}
            <span className="faint">{t(SOURCE_LABEL[row.source])}</span>

            {isBooleanField(row.field) ? (
              <Switch
                checked={row.value === true}
                disabled={disabled || !row.decidedHere}
                ariaLabel={t(policyLabel(row.field))}
                onCheckedChange={(on) => onPatch({ [row.field]: on })}
              />
            ) : (
              <PolicyNumber
                t={t}
                row={row}
                limits={view.limits[row.field]}
                disabled={disabled || !row.decidedHere}
                onSave={(value) => onPatch({ [row.field]: value })}
              />
            )}

            <Switch
              checked={row.decidedHere}
              disabled={disabled}
              ariaLabel={t('bookingDecideHereLabel', { field: t(policyLabel(row.field)) })}
              onCheckedChange={(on) => onPatch(overrideToggle(row, on))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A number that is saved when the box is left, not on every keystroke — a
 *  PATCH per digit would write "seating: 1" on the way to 120. */
function PolicyNumber({
  t,
  row,
  limits,
  disabled,
  onSave,
}: {
  t: Translate;
  row: { field: PolicyField; value: number | boolean };
  limits: { min: number; max: number } | undefined;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(row.value));

  useEffect(() => {
    setDraft(String(row.value));
  }, [row.value]);

  const parsed = parsePolicyNumber(draft, limits);

  return (
    <span className="booking__number">
      <TextInput
        value={draft}
        inputMode="numeric"
        disabled={disabled}
        aria-label={t(policyLabel(row.field))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (parsed !== null && parsed !== row.value) {
            onSave(parsed);
          } else {
            setDraft(String(row.value));
          }
        }}
      />
      {limits && (
        <span className="faint">{t('bookingRange', { min: limits.min, max: limits.max })}</span>
      )}
    </span>
  );
}

function policyLabel(field: PolicyField): AdminTranslationKey {
  return FIELD_LABEL[field];
}

// ── what the settings would actually offer ──────────────────────────────────

function Preview({ t, branchId, version }: { t: Translate; branchId: string; version: string }) {
  const [date, setDate] = useState(() => todayInYerevan());
  const [guests, setGuests] = useState('2');
  const [preview, setPreview] = useState<BookingPreview | null>(null);
  const [failed, setFailed] = useState(false);

  const party = parsePolicyNumber(guests, { min: 1, max: 200 }) ?? 2;

  useEffect(() => {
    let live = true;
    setFailed(false);
    api
      .bookingPreview(branchId, date, party)
      .then((result) => {
        if (live) {
          setPreview(result);
        }
      })
      .catch(() => {
        if (live) {
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
    // `version` changes after every successful save, which is what makes this a
    // preview of the settings rather than of the settings as they were.
  }, [branchId, date, party, version]);

  return (
    <Card className="booking__preview">
      <h4 className="booking__heading">{t('bookingPreviewTitle')}</h4>
      <p className="faint">{t('bookingPreviewHint')}</p>

      <div className="booking__add">
        <Field label={t('bookingPreviewDate')}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('bookingPreviewGuests')}>
          {(id) => (
            <TextInput
              id={id}
              value={guests}
              inputMode="numeric"
              onChange={(event) => setGuests(event.target.value)}
            />
          )}
        </Field>
      </div>

      {failed && <p className="booking__warn">{t('bookingPreviewFailed')}</p>}

      {preview !== null && !failed && (
        <p className={preview.slotCount === 0 ? 'booking__warn' : 'strong'}>
          {preview.opens === null
            ? t('bookingPreviewClosed', { reason: preview.closureReason ?? '' })
            : preview.slotCount === 0
              ? t('bookingPreviewNoSlots', { opens: preview.opens, closes: preview.closes ?? '' })
              : t('bookingPreviewSlots', {
                  count: preview.slotCount,
                  first: preview.firstSlot ?? '',
                  last: preview.lastSlot ?? '',
                  deposit: preview.depositAmd,
                  maxSeats: preview.maxSeats,
                })}
        </p>
      )}

      {preview !== null && !preview.reservationsEnabled && (
        <p className="booking__warn">{t('bookingPreviewDisabled')}</p>
      )}
    </Card>
  );
}

// ── the refusal ─────────────────────────────────────────────────────────────

/**
 * The bookings a change would strand, and the offer to save it anyway.
 *
 * Deliberately explicit that going ahead **cancels nothing**. The temptation is
 * to word this as "the bookings will be cancelled", which would be shorter and
 * false: the rows survive untouched, and somebody has to ring these people.
 */
function ConflictDialog({
  t,
  branchName,
  conflicts,
  onCancel,
  onConfirm,
}: {
  t: Translate;
  branchName: string;
  conflicts: BookingConflict[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
      title={t('bookingConflictTitle', { count: conflicts.length })}
    >
      <DialogBody>
        <p>{t('bookingConflictBody', { branch: branchName })}</p>
        <ul className="booking__conflicts">
          {conflicts.map((conflict) => (
            <li key={conflict.reservationId} className="booking__conflict">
              <span className="strong">
                {conflict.localDate} {conflict.localTime}
              </span>
              <span className="faint">
                {t('bookingConflictParty', {
                  guests: conflict.guests,
                  table: conflict.tableNo ?? '—',
                })}
              </span>
              <span className="faint">{conflict.customerName ?? ''}</span>
              <Badge tone="warn">{t(REASON_LABEL[conflict.reason])}</Badge>
            </li>
          ))}
        </ul>
        <p className="strong">{t('bookingConflictNoCancel')}</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t('bookingConflictBack')}
        </Button>
        <Button onClick={onConfirm}>{t('bookingConflictSaveAnyway')}</Button>
      </DialogFooter>
    </Dialog>
  );
}
