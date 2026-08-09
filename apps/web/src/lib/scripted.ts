'use client';

import { useEffect, useState } from 'react';

/**
 * Whether this page has JavaScript running yet.
 *
 * Every basket control on a restaurant page is a `<form>` posting a Server
 * Action, because that is what makes the whole flow work with JavaScript off.
 * Where there *is* JavaScript, the same control does the same write without the
 * redirect that follows it — but it may only take that path once React is
 * actually driving, which is what this answers.
 *
 * It flips in an effect rather than being read during render: the first client
 * render has to produce exactly what the server sent, or hydration is a
 * mismatch. So the honest answer during hydration is "no", and it becomes "yes"
 * one commit later.
 */
export function useScripted(): boolean {
  const [scripted, setScripted] = useState(false);
  useEffect(() => setScripted(true), []);
  return scripted;
}
