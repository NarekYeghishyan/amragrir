# Design sources

The design artifacts themselves, as HTML, so that a claim about the
design can be **checked** rather than taken on trust.

Until this folder existed, the artifacts were opened once, distilled into
`DESIGN_SYSTEM.md` / `SCREENS.md` / `COMPONENTS.md`, and then gone. The cost
showed up immediately: `DESIGN_SYSTEM.md` had to record in prose that the two
artifacts disagree about four opacity values, because there was no longer
anything to re-read. Anything derived from a design belongs in those documents;
this folder is what those documents were derived *from*.

| File | Artifact | Canvas | In repo since |
|---|---|---|---|
| `web-landing.html` | Web landing | 1280×860 | 2026-08-03 |
| — *missing* — | Mobile app | 820×1020, 12 screens | not yet added |

**The mobile artifact is authoritative** where the two disagree — it is the
fuller design and the one every app already matches. It is also the one still
missing here, which matters more than its absence suggests: eight of the
fourteen screens in `SCREENS.md` are unbuilt, and they are all its.

## Refreshing one

Export the HTML from the artifact and overwrite the file in place, keeping the
name. Then re-read it against the code and update whatever moved — the diff is
the point of storing it. A published artifact URL is not a substitute: it is not
versioned, it can change under a reader, and access to it is not guaranteed.

## What `web-landing.html` actually contains

Two screens — `home` and `restaurant` — and four overlays: the floating cart
bar, the cart drawer (checkout lives inside it), the empty-cart state, and the
order-confirmed modal. Six mock restaurants, five dishes, three languages,
light and dark.

Its ordering flow **is built** as of 2026-08-03 (see
[apps/web/README.md](../../apps/web/README.md)) — the earlier note here, that it
was a proposal Phase 9 had declined, is out of date. What the artifact draws is
now the visual specification for the web checkout: the 440px right-hand panel,
the 24px quantity chips, the uppercase section labels, the ready-time pills, the
payment rows and the confirmation card are all transcribed from it.

The two places the implementation departs from it are recorded below, under
"Contradicts the code", and one more that the refresh introduced: **the drawer
and the confirmation modal became routes.** A drawer that is only a state
vanishes on reload, and the confirmation carries the pickup code, which has to
survive one. Both keep the artifact's appearance; both now have a URL.

### Refreshed 2026-08-03 — what the new export changed

Re-read against the code, declaration by declaration: **117 of the artifact's
144 distinct measurements already matched `globals.css` verbatim.** The header,
hero, category rail, filter chips, restaurant cards, banner, rating card, menu
tabs and dish cards were all still accurate and were left alone. Three things
had genuinely moved, and were transcribed:

- **The logo.** The pin now holds a fork *and* a knife and carries a clock badge
  on its shoulder; it used to be a fork and spoon with no badge. The clock is
  the product in one glyph — this is order-ahead, not delivery. Now
  `components/Brand.tsx`, shared by the header and the footer.
- **The wordmark.** `amragrir.am`, Latin and lowercase with only `.am` in the
  accent colour, at 18px — it was the translated brand name at 21px, entirely
  in accent. The artifact hardcodes it *outside* its `L` dictionary while
  everything around it comes from inside one, which is how it says this is a
  logotype and not a string.
- **The footer**, rebuilt: logo and wordmark open the brand column, three social
  marks close it, the copyright line moved inside the container as a
  rule-separated bottom bar, headings went from `--ink3` to `--ink`, and the
  grid went `2fr` → `1.6fr` with a 40px gap.

One more divergence the audit turned up, unrelated to the refresh: the dish
**add button** was a pale `--accent-soft` chip at 34px where the artifact draws
a solid `--accent` disc at 38px with a shadow. Fixed.

**Not transcribed, deliberately: the sticky order panel** on the restaurant
screen (`1fr 380px`, `position:sticky`, lines with 28px quantity steppers,
subtotal/service/total and a checkout button). It cannot be built as drawn
without breaking two decisions this app is built on — reading the basket on the
server would opt every restaurant page out of pre-rendering, and pricing it in
the browser would need a client-side API call and a total the client computed
(`apps/web/README.md`, BUSINESS_LOGIC.md §money). `StickyBasket` plus the header
basket is the adaptation, and this is the gap to reopen if the panel matters
more than the pre-rendering.

### Reconciled against the implemented backend, 2026-08-03

Agrees: all 26 palette tokens; the menu tabs (`Popular/Mains/Sides/Drinks`)
match `MenuTab` exactly; the service badges match `RestaurantService`.

**Contradicts the code in two places.**

*Cash is offered as a payment method* — `payNames` ends in `Cash` / `Наличные` /
`Կանխիկ`. `PaymentMethod` has no such value and says why: an order is paid for
before the kitchen ever sees it, so nothing can owe money at the counter
(BUSINESS_LOGIC.md §5). The design is wrong here, not the code.

*"Reserve Table" leads nowhere.* The filter chip and the per-restaurant badge
are drawn, but no booking flow exists in the artifact — no date, guests, slots
or deposit — while the API implements all of it. The web now implements it too,
so this gap is closed in code and still open in the design: the date pager,
guest picker, slot grid and deposit card on `/[lang]/preorder` have no artifact
to check against.

**Absent from the artifact, and therefore designed in code rather than
transcribed** — each was built to the artifact's own tokens and measurements,
and each is a place a future refresh should be checked against reality: order
tracking (the artifact stops at the confirmation modal, and there are eight
order statuses); a failed payment and the unpaid order it leaves behind;
cancellation, and that paying ends the right to it; the deposit and referral
lines in the totals; basket limits; the one-restaurant-per-basket rule;
sold-out dishes; **branches** (the artifact treats a restaurant as a single
place — a restaurant has up to ten, each with its own address, hours and menu);
and **any authentication at all**, though placing an order requires an
identity, so the web's phone-and-OTP screen has no artifact behind it.

Two of its six filter chips do not map to an API parameter: "Near Me" needs
browser geolocation, and "Ready in 15 min" is a threshold where the API offers a
sort.
