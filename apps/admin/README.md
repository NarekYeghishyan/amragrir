# @amragrir/admin

Placeholder — not yet scaffolded. Internal back office for the `owner`, `staff`
and `admin` roles (see [docs/ROLES_AND_PERMISSIONS.md](../../docs/ROLES_AND_PERMISSIONS.md)),
combined into one RBAC-gated app rather than split up front — no public/SEO
surface, so a plain SPA is enough (unlike `apps/web`).

## Stack

React + Vite (no Next.js/SSR — internal tool only).

## Next step

Scaffold in place (run from this folder):

```
pnpm create vite@latest . -- --template react-ts
```

Then wire up `@amragrir/shared` (roles, order/reservation statuses) and
`@amragrir/ui`. Screens follow the Owner/Admin capability lists in
[docs/ROLES_AND_PERMISSIONS.md](../../docs/ROLES_AND_PERMISSIONS.md) and the
`Owner / Admin` section of [docs/API_DOCUMENTATION.md](../../docs/API_DOCUMENTATION.md).
