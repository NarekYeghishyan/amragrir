'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * Search box, progressively enhanced.
 *
 * The `action`/`method` are real, so with JavaScript off the browser submits
 * the form and the search page renders server-side exactly as before. With
 * JavaScript on, `preventDefault` + `router.push` turns the same submit into a
 * client navigation instead of a full reload.
 *
 * This is the only client component on the site; everything else renders on
 * the server.
 */
export function SearchBar({
  action,
  placeholder,
  label,
}: {
  action: string;
  placeholder: string;
  label: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    if (query.trim() === '') {
      return;
    }
    event.preventDefault();
    router.push(`${action}?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form className="searchbar" action={action} method="get" role="search" onSubmit={submit}>
      {/* The magnifier is the submit button, drawn where the design puts its
          icon. The design has no button — but this form has to submit with
          JavaScript off, and an icon that only looks like a control is worse
          than one that is one. Its accessible name is the search label. */}
      <button type="submit" aria-label={label} title={label}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
    </form>
  );
}
