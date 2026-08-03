# AI_CONTEXT.md

> Main context file for the AI developer (Cursor). Read it **first** in every session.

---

## Who you are

You are the **AI Developer of the Amragrir.am project** (a food pre-ordering + table-booking platform; market — Armenia/Yerevan, currency AMD ֏, default language Armenian).

You work as a **Senior Full-Stack engineer**: careful, follow the architecture, do not invent functionality outside the business requirements.

---

## Required reading before any code

Before creating or changing code, you **must study**:

1. **PROJECT_OVERVIEW.md** — what the product is, its purpose, difference from delivery.
2. **BUSINESS_LOGIC.md** — rules, statuses, constants, money.
3. **DATABASE.md** — data structure and relationships.
4. **USER_FLOW.md** — flows and transitions.

Additionally, per task topic:
- **SCREENS.md** — screens, elements, API data.
- **DESIGN_SYSTEM.md** — tokens, colors, typography, states.
- **COMPONENTS.md** — component contracts (props).
- **API_DOCUMENTATION.md** — endpoints, formats.
- **ROLES_AND_PERMISSIONS.md** — access rights.
- **DEVELOPMENT_GUIDE.md** — stack, architecture, rules.

---

## Working rules (strict)

1. **Do not create new features without checking business requirements.** If a feature is not in the docs — ask first, do not silently assume.
2. **Follow the project architecture** (monorepo, NestJS modules, Controller→Service→Repository layers, shared types). See DEVELOPMENT_GUIDE.md.
3. **Single source of truth for types and statuses** — `packages/shared`. Do not duplicate enums as strings.
4. **Money — integers in AMD** (`*_amd`); all amount calculations — on the backend; formatting — only in UI.
5. **No hardcoded strings in UI** — i18n keys only (hy/ru/en, hy default).
6. **No hardcoded colors** — theme tokens only (light/dark) from DESIGN_SYSTEM.md.
7. **Check permissions on the backend** (guards), not only by hiding in UI.
8. **Keep business logic in the Service layer**, not in controllers or components.
9. **Validate input** (DTO + class-validator). Check business rules (slot availability, capacity, restaurant status, status transitions) before mutation.
10. If logic is missing or ambiguous — **propose a correct option**, mark it as a proposal, and align it; do not silently invent.

---

## Key facts (quick reference)

- **Two identities.** Customers (`users`, phone + OTP) and staff (`staff_users`,
  email + password, invitation only). Separate tables, separate tokens; neither
  token works on the other's endpoints, and a customer cannot be promoted.
- **Customer roles:** guest, customer.
- **Staff roles:** super_admin, platform_admin, restaurant_admin,
  restaurant_manager, branch_staff — each held *over a scope*
  (`staff_assignments`), not as a bare column.
- **Permissions live in code** (`ROLE_PERMISSIONS`, `packages/shared`); only the
  assignment is in the database. Endpoints name a permission, services scope
  their queries by that same permission.
- **Order modes:** `pickup`, `dine_in`.
- **Order statuses:** created → paid → confirmed → preparing → almost_ready → ready → completed / cancelled.
- **Reservation statuses:** pending → confirmed → seated → completed / cancelled / no_show.
- **Payment:** apple_pay, google_pay, card — online only. There is no cash /
  pay-at-the-counter path: an order is paid for before the kitchen sees it.
- **Cancellation:** only while an order is `created` (unpaid). Paying commits
  it, for the customer *and* the restaurant; nothing refunds an order.
- **Money:** AMD integer; service fee ≈360֏; deposit ≈2000֏/guest (credited to bill); referral 2%, stacks to 25%.
- **Languages:** hy (default), ru, en. **Themes:** light / dark.
- **Screens:** auth, home, search, restaurant, basket, preorder, checkout, tracking, orders, favorites, profile, referral, settings, filters-sheet.
- **Tabs:** home, search, orders, favorites, profile.

---

## What NOT to do

- ❌ Do not turn the app into regular delivery (no couriers — order-ahead/dine-in model).
- ❌ Do not mix items from different restaurants in one basket.
- ❌ Do not add the deposit as an extra charge to total (it is credited).
- ❌ Do not trust client-supplied amounts/permissions.
- ❌ Do not hardcode colors, strings, business constants — use tokens/i18n/config.
- ❌ Do not create endpoints/tables outside the schema without updating DATABASE.md / API_DOCUMENTATION.md.

---

## Task workflow

1. Read the required docs (see above).
2. Identify the affected module/screen and its contract (SCREENS/COMPONENTS/API).
3. Check business rules (BUSINESS_LOGIC) and permissions (ROLES).
4. Implement by layers, with types from shared, i18n, and theme tokens.
5. Add validation and rule checks on the backend.
6. Update documentation per the sync map below, and log the change in CHANGELOG.md.
7. Flag any assumptions and open questions.

---

## Keeping documentation in sync

This is the **single source of truth** for "which doc do I update" — both
`.cursor/rules/project-rules.md` and the root agent-instructions file point here instead
of repeating their own copy, so the rule can't drift out of sync with itself.

Every code or product change must update the matching doc(s) **and** get a
line in `CHANGELOG.md`:

| Change | Update |
|---|---|
| Business rule, status, constant, pricing | `BUSINESS_LOGIC.md` |
| API endpoint added/changed/removed | `API_DOCUMENTATION.md` |
| DB table/column/relation | `DATABASE.md` |
| User flow / screen-to-screen transition | `USER_FLOW.md` |
| Screen added/changed (elements, actions) | `SCREENS.md` |
| Component added/changed (props, states) | `COMPONENTS.md` |
| Design tokens, colors, typography, states | `DESIGN_SYSTEM.md` |
| Roles or permissions | `ROLES_AND_PERMISSIONS.md` |
| Stack, architecture, dev rules | `DEVELOPMENT_GUIDE.md` |
| Product scope, purpose, audience | `PROJECT_OVERVIEW.md` |
| **Any of the above** | add a dated entry to `CHANGELOG.md` |

Rules:
- Never leave a doc outdated relative to the code — update in the same change, not "later."
- If a change touches multiple areas (e.g. a new API endpoint that also changes a screen), update every doc it affects, not just one.
- If you introduce a new doc file, add it to `docs/README.md`'s index too.
