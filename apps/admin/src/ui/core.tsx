import { useId, type ComponentProps, type ReactNode } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { useT } from '../i18n';
import { Icon, type IconName } from './icons';

/**
 * The plain pieces of the back office — the ones with no open/closed state and
 * so nothing for Radix to manage.
 *
 * They exist for the same reason the Radix wrappers do: a screen should ask for
 * "a destructive button" or "an empty state", not re-derive one out of class
 * names. Every colour here resolves to a token from `tokens.css`; none of these
 * components knows a hex value.
 */

/** Joins class names, dropping the falsy ones. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ── button ──────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * `loading` keeps the button's width and swaps the icon slot for a spinner, so
 * a row does not reflow the instant someone clicks it — the panel's actions are
 * network calls, and a layout that jumps on every one of them reads as broken.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  loading?: boolean;
} & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', className)}
      disabled={disabled === true || loading}
      data-loading={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon !== undefined && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}
      {children}
    </button>
  );
}

/** Icon-only. `label` is required because there is no text to read out. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  className,
  ...rest
}: {
  icon: IconName;
  label: string;
  variant?: ButtonVariant;
} & Omit<ComponentProps<'button'>, 'children'>) {
  return (
    <button
      type="button"
      className={cx('btn', 'btn--icon', `btn--${variant}`, className)}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

// ── surfaces ────────────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <SeparatorPrimitive.Root className={cx('separator', className)} />;
}

/**
 * The band at the top of every screen: what this is, and the one action that
 * starts something new.
 *
 * Uniform across the seven screens on purpose — a back office is a place people
 * work in all day, and a title that moves between tabs costs a re-orientation
 * every time.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h2 className="page-header__title">{title}</h2>
        {description !== undefined && <p className="page-header__desc">{description}</p>}
      </div>
      {/* Truthiness, not `!== undefined`: callers pass `canWrite && <Button/>`,
          which is `false` for a read-only account, not absent. */}
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

/** The filter/search strip that sits under a page header. */
export function Toolbar({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cx('toolbar', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {aside}
    </div>
  );
}

// ── status ──────────────────────────────────────────────────────────────────

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'danger';

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx('badge', `badge--${tone}`)}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * A message that stays on screen — a list that failed to load, or a result that
 * has to survive longer than a toast because somebody will act on it.
 *
 * Transient "saved"/"could not save" feedback belongs in `useToast` instead.
 */
export function Banner({
  tone = 'danger',
  children,
  onDismiss,
}: {
  tone?: Tone;
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const t = useT();
  return (
    <div className={cx('banner', `banner--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={tone === 'danger' ? 'warning' : 'check'} size={17} className="banner__icon" />
      <div className="banner__text">{children}</div>
      {onDismiss !== undefined && (
        <IconButton icon="close" label={t('actionDismiss')} onClick={onDismiss} />
      )}
    </div>
  );
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty__title">{title}</p>
      {description !== undefined && <p className="empty__desc">{description}</p>}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}

// ── pagination ──────────────────────────────────────────────────────────────

/** A gap in the page numbers, rendered as an ellipsis. */
export const PAGE_GAP = 'gap';

/** One slot in the pager: a page to jump to, or the run that was skipped. */
export type PageEntry = number | typeof PAGE_GAP;

/**
 * Which page numbers to show, with `PAGE_GAP` where a run is skipped.
 *
 * Always the same width — first, last, the current page and one either side,
 * padded out near the ends so the strip does not resize as somebody walks
 * through it. A pager whose buttons move under the cursor between clicks is
 * worse than one that shows a page too many.
 *
 * Exported and pure so the arithmetic is tested directly; the component below
 * only renders what this returns.
 */
export function pageNumbers(current: number, pages: number): PageEntry[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }

  // Clamped so the window keeps its width at both ends rather than running off.
  let start = Math.min(Math.max(current - 1, 2), pages - 4);
  let end = Math.max(Math.min(current + 1, pages - 1), 5);

  // A gap standing in for a single page is worse than the page: same width, no
  // information, and one more click to reach it. Absorb it into the window
  // instead — the slot is already paid for, so the strip keeps its width.
  if (start === 3) {
    start = 2;
  }
  if (end === pages - 2) {
    end = pages - 1;
  }

  const gap: PageEntry[] = [PAGE_GAP];

  return [
    1,
    ...(start > 2 ? gap : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end < pages - 1 ? gap : []),
    pages,
  ];
}

/**
 * Page navigation for a list the API returns one page of.
 *
 * Numbers rather than only prev/next: a back office is where somebody looks for
 * the account that signed up in March, and stepping there one page at a time is
 * not navigation. The range summary is the other half — "1–25 of 312" is what
 * says whether the thing being looked for is even in this list.
 *
 * Renders nothing for a single page. A pager under a list that fits on one
 * screen is furniture.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** Translated here rather than inside, so this stays a presentational
   *  primitive like everything else in this file. */
  labels: {
    nav: string;
    previous: string;
    next: string;
    /** Given the 1-based page number, for the button's accessible name. */
    page: (page: number) => string;
    range: string;
  };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return null;
  }

  const step = (to: number) => (): void => onPage(Math.min(Math.max(to, 1), pages));

  return (
    <nav className="pager" aria-label={labels.nav}>
      <span className="pager__range">{labels.range}</span>

      <span className="pager__pages">
        <IconButton
          icon="chevronLeft"
          label={labels.previous}
          disabled={page === 1}
          onClick={step(page - 1)}
        />

        {pageNumbers(page, pages).map((entry, index) =>
          entry === PAGE_GAP ? (
            <span key={`gap-${index}`} className="pager__gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className="pager__page"
              // The current page is a state, not a destination — `aria-current`
              // says so, and is what stops it being read as one more link.
              aria-current={entry === page ? 'page' : undefined}
              aria-label={labels.page(entry)}
              onClick={step(entry)}
            >
              {entry}
            </button>
          ),
        )}

        <IconButton
          icon="chevronRight"
          label={labels.next}
          disabled={page === pages}
          onClick={step(page + 1)}
        />
      </span>
    </nav>
  );
}

/** Shown while a list is loading, in the shape the list will take. */
export function Skeleton({ height = 72, count = 1 }: { height?: number; count?: number }) {
  return (
    <div className="skeletons" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

// ── forms ───────────────────────────────────────────────────────────────────

/**
 * Label, control and hint as one unit.
 *
 * The generated id is what ties the `<label>` to the control, so every field in
 * the panel is clickable by its label without anyone remembering to wire it —
 * the reason this is a component rather than a class name.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <LabelPrimitive.Root className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </LabelPrimitive.Root>
      {children(id)}
      {error !== undefined ? (
        <p className="field__error">{error}</p>
      ) : (
        hint !== undefined && <p className="field__hint">{hint}</p>
      )}
    </div>
  );
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx('input', className)} {...rest} />;
}

/** A text input with a search glyph inside it. */
export function SearchInput({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <span className={cx('search', className)}>
      <Icon name="search" size={16} className="search__icon" />
      <input type="search" className="input input--search" {...rest} />
    </span>
  );
}
