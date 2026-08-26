# Manual Coolify bootstrap (not on deploy)

Dump files ship in the API image. Deploy does **not** import them.

Run **once** in Coolify → API → Execute Command:

```bash
pnpm bootstrap:prod -- --email you@ctnsolution.com --password 'YourStrongPass1' --first-name Your --last-name Name
```

- migrate
- import full DB dump only if zero users (never overwrites later)
- create SUPER_ADMIN from the flags

No new env vars. Optional: `--force`, `--skip-import`.
