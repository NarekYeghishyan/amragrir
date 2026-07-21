# @amragrir/api

Placeholder — not yet scaffolded. Backend for all three clients (mobile, web, admin).

## Stack

NestJS (TypeScript) + PostgreSQL (Prisma) + Redis (cache/queues/OTP). See
[docs/DEVELOPMENT_GUIDE.md](../../docs/DEVELOPMENT_GUIDE.md).

## Next step

Scaffold in place with the Nest CLI (run from this folder):

```
pnpm dlx @nestjs/cli new . --package-manager pnpm --skip-git
```

Then wire up `packages/shared` for enums/constants (`@amragrir/shared`) instead of
redefining statuses locally, and follow the module list in
[docs/DEVELOPMENT_GUIDE.md](../../docs/DEVELOPMENT_GUIDE.md) §2.
