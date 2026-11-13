# AGENTS.md

This is a StartOS service-package repository — it builds a `.s9pk` for StartOS.

Develop it inside a StartOS packaging workspace created by `start-cli s9pk init-workspace`,
which provides the packaging guide and agent context one level up. If you're reading this in a
bare clone with no workspace, the full guide is at <https://docs.start9.com/packaging>.

## Traps in this package

- The `spark` commands the package runs (`install:create-superadmin`, `shield:user password`,
  `shield:user changeemail`) are interactive. The scripts pipe answers into them, and the
  prompts **echo the password**, so their output goes to a temp file and only filtered lines
  are ever printed. Keep it that way; never let that output reach the service log.
- CLI calls outside the running Castopod daemon have no `/app/.env`. They get database
  settings from `database_default_*` environment variables (`cliDatabaseEnv` in
  `startos/utils.ts`), which CodeIgniter reads directly.
- SMTP goes in as CodeIgniter `email_*` variables, not upstream's `CP_EMAIL_*`; see the README's
  File Models section for why. Don't "simplify" it back.
- Changing the shell scripts: extract them and run them against the real images locally
  (MariaDB container + `--network container:<db>` for the Castopod side, to mimic StartOS's
  shared localhost) before trusting a build.
- External media storage is an idmapped read-write mount: root cannot create files in it, so
  anything written there runs as `www-data`. Never mount an external media folder read-write
  before a read-only mount has proved it exists — a read-write mount of a missing folder
  recreates it empty and root-owned (`listProviderFolder` in `startos/mediaStorage.ts`).
- Mount at real paths only. The image's `/app` is a symlink to `/var/www/html`; StartOS creates
  mountpoints without following symlinks, so a mount under `/app/...` fails with `ENOTDIR` (Docker
  follows it, so local tests won't catch this).
- `main.ts` overwrites the image's `bootstrap/up` so the bootstrap's closing `cat .env` prints
  secrets as `<redacted>`. Don't drop it, and pass any new secret through a key the redaction
  pattern matches: support asks users for their logs.
