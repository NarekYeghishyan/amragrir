Every time you change code or business logic:

1. Read `docs/AI_CONTEXT.md` first — it is the single source of truth for
   which doc to update for which kind of change ("Keeping documentation in
   sync" section) and for the project's working rules.
2. Update every doc file affected by the change, per that mapping.
3. Add an entry to `docs/CHANGELOG.md` describing what changed and why.
4. Never leave documentation outdated or inconsistent with the code.

Do not duplicate the file-mapping rules here — edit them in
`docs/AI_CONTEXT.md` so every AI assistant working on this repo (see the root
agent-instructions file) stays in sync with a single copy of the rule.