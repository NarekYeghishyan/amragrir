/**
 * What this app accepts as somebody's name, in one place.
 *
 * Two screens ask for it — the sign-up tab (`app/auth.tsx`) and the Settings
 * sheet behind "Edit profile" (`app/settings.tsx`) — and they must agree, or a
 * name required to open an account could be emptied from Settings a minute
 * later. `PhoneField` reads its rules from `@amragrir/shared` for the same
 * reason; a name has no server-side shape to borrow beyond the length cap, so
 * the rule lives here.
 *
 * The floor is deliberately low. A name is what somebody calls themselves, and
 * a form is in no position to argue with it — this rejects the empty field and
 * the stray keystroke, and nothing else. No pattern, no "two words": plenty of
 * people have one name, and an app in Yerevan will meet transliterations in
 * three alphabets.
 */

/** One character is an initial, not a name. */
export const MIN_NAME = 2;

/** The API's own `@MaxLength(120)` on `verify-code` and `PATCH /me`. */
export const MAX_NAME = 120;

/** Exactly what gets sent — trimmed, and cut to what the API will take. */
export function normalizeName(value: string): string {
  return value.trim().slice(0, MAX_NAME);
}

/** Whether the button that sends it should be pressable. */
export function isValidName(value: string): boolean {
  return normalizeName(value).length >= MIN_NAME;
}
