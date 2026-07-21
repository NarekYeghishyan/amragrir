# Amragrir.am

Food pre-ordering + table-booking platform (Yerevan, Armenia). This repo is
currently **docs-first**: `/docs` defines the product before implementation
code exists.

## Before any code or doc change

Read [docs/AI_CONTEXT.md](./docs/AI_CONTEXT.md) first — it is the main
context file (required reading, working rules, key facts) and the single
source of truth for which doc file to update for a given change (see its
"Keeping documentation in sync" section).

After any change, update the matching doc(s) per that mapping and add an
entry to [docs/CHANGELOG.md](./docs/CHANGELOG.md). Never leave `/docs`
out of sync with the code.

This same rule also lives in `.cursor/rules/project-rules.md` for Cursor —
both point at `docs/AI_CONTEXT.md` rather than duplicating it, so the rule
itself can't drift between tools.
