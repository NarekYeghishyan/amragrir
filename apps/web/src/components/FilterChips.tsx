import Link from 'next/link';
import type { Language } from '@amragrir/shared';
import { t } from '@/lib/language';
import {
  chipHref,
  chipsFor,
  clearHref,
  hasAnyFilter,
  isActive,
  type FilterState,
} from '@/lib/filters';

/**
 * Quick-filter chips for the home listing, from the web design.
 *
 * Each chip is a real `<Link>` to the home path with that filter toggled, so it
 * works with JavaScript off (a plain navigation) and upgrades to client
 * navigation with it on — the same progressive-enhancement stance as the rest
 * of the site. Nothing here is a click handler and nothing filters on the
 * client; the server owns the query.
 *
 * Active chips carry `aria-current` rather than `aria-pressed` — these are
 * links, not buttons, and clicking an active one navigates to the view with
 * that filter removed.
 */
export function FilterChips({
  state,
  language,
  hasOrigin = false,
}: {
  state: FilterState;
  language: Language;
  /** Whether a district is chosen; decides if "near me" is offered at all. */
  hasOrigin?: boolean;
}) {
  const label = t(language);

  return (
    <nav className="filters" aria-label={label('filtersLabel')}>
      <ul className="chips">
        {chipsFor(hasOrigin).map((chip) => {
          const active = isActive(state, chip);
          return (
            <li key={chip.id}>
              <Link
                className={active ? 'chip on' : 'chip'}
                href={chipHref(state, chip, language)}
                aria-current={active ? 'true' : undefined}
                // The listing below re-renders; don't jump the viewport to the
                // top when only the chip row and the results change.
                scroll={false}
              >
                <span aria-hidden="true">{chip.icon}</span>
                {label(chip.labelKey)}
              </Link>
            </li>
          );
        })}

        {hasAnyFilter(state) && (
          <li>
            <Link className="chip filter-clear" href={clearHref(language)} scroll={false}>
              {label('filtersClear')}
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
