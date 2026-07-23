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
      <input
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      <button type="submit">{label}</button>
    </form>
  );
}
