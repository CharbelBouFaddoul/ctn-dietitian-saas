# Clone local → Coolify

Dump files ship in the API image. Deploy does **not** import them automatically.

## 1. Snapshot this machine

Local Docker must be running (`pnpm dev:docker`):

```bash
./scripts/export-coolify-clone.sh
```

That writes:

- `deploy/bootstrap/database.dump` — every table and row (users, settings, clinics, patients, catalogs)
- `deploy/bootstrap/storage.tar.gz` — uploaded files
- `deploy/bootstrap/manifest.txt`

Commit and push those files, then let Coolify rebuild the **API** image.

## 2. Restore on production

Coolify → API service → **Execute Command**:

First-time empty database:

```bash
pnpm bootstrap:prod -- --email you@ctnsolution.com --password 'YourStrongPass1' --first-name Your --last-name Name
```

Replace production with this local snapshot (same users, passwords, settings):

```bash
CONFIRM_REPLACE=1 pnpm bootstrap:prod -- --replace --skip-admin
```

`--replace` wipes the production database. It will not run without `CONFIRM_REPLACE=1`.

Then log in on the public site with the **same emails and passwords** you use locally.

Optional: `--force` updates an existing SUPER_ADMIN password; `--skip-import` only migrates / creates admin.
