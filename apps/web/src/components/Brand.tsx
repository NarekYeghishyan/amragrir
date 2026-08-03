/**
 * The logo, in one place because the header and the footer both draw it.
 *
 * Transcribed from `docs/design/web-landing.html` (refreshed 2026-08-03), which
 * changed the mark: the pin now holds a fork *and a knife*, and carries a clock
 * badge on its shoulder. The clock is the product in one glyph — this is
 * order-ahead, not delivery — so it is worth the two extra paths.
 *
 * Inline SVG rather than a file, because it recolours with the theme:
 * `var(--accent)` cannot reach inside an `<img src>`.
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" fill="none" aria-hidden="true">
      <path
        d="M36 6c-13 0-23 9.6-23 23 0 15.5 23 41 23 41s23-25.5 23-41C59 15.6 49 6 36 6Z"
        fill="var(--accent)"
      />
      <g stroke="#fff" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M25 16v8M30 16v9M35 16v8" strokeWidth="2.8" />
        <path d="M25 24c0 3.4 2.2 5 5 5s5-1.6 5-5" strokeWidth="2.8" />
        <path d="M30 29v21" strokeWidth="3.6" />
        <path d="M46 50V34" strokeWidth="3.6" />
      </g>
      <path d="M46 16c-3.4 0-5.2 3.4-5.2 7.6s1.8 6.4 5.2 6.4V16Z" fill="#fff" />
      <circle cx="58" cy="20" r="11" fill="#fff" stroke="var(--accent)" strokeWidth="3" />
      <path
        d="M58 15v5l3.4 2.2"
        stroke="var(--accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The wordmark: `amragrir.am`, with the domain suffix in the accent colour.
 *
 * Latin and lowercase in all three languages, and deliberately **not** an i18n
 * string. The dictionaries do hold a translated brand name — `Ամրագրիր`,
 * `Амрагрир` — but that is the name as *prose*, and this is a logotype built on
 * the domain. The artifact says so by hardcoding it outside its `L` dictionary
 * while everything around it comes from inside one.
 *
 * The translated name is not lost: whatever wraps this passes it as the link's
 * accessible name, so a screen reader in Armenian still announces `Ամրագրիր`
 * while the eye reads the domain.
 */
export function Wordmark() {
  return (
    <span className="wordmark" aria-hidden="true">
      amragrir<span className="wordmark-tld">.am</span>
    </span>
  );
}
