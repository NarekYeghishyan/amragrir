/**
 * Turning query-string text into the types a DTO declares.
 *
 * Lives here rather than beside one module's DTOs because a flag in a URL means
 * the same thing on every endpoint that takes one — and `Boolean('false')` is
 * `true`, which is the kind of thing that has to be got wrong only once.
 */

/**
 * A query string is always text, so `Boolean('false')` would be `true`. Treat
 * only `1`/`true` as on, and leave the field absent otherwise so an unset flag
 * never adds a filter.
 */
export const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return value === true || value === '1' || String(value).toLowerCase() === 'true';
};
