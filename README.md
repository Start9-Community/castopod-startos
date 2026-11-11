<p align="center">
  <img src="icon.svg" alt="Castopod Logo" width="21%">
</p>

# Castopod on StartOS

> Everything not listed in this document should behave the same as upstream
> Castopod. If a feature, setting, or behavior is not mentioned here, the
> upstream documentation is accurate and fully applicable — see the
> Documentation section of `instructions.md` for links.

[Castopod](https://code.castopod.org/adaures/castopod) is a podcast hosting platform with built-in ActivityPub federation. This package runs it with a private MariaDB, creates the owner account itself, replaces upstream's install wizard and environment-variable setup with StartOS actions, and can keep Castopod's media in a folder of NextExplorer, FileBrowser Quantum or Nextcloud.

---

## Table of Contents

- [Image and Container Runtime](#image-and-container-runtime)
- [Volume and Data Layout](#volume-and-data-layout)
- [File Models](#file-models)
- [Dependencies](#dependencies)
- [Network Access and Interfaces](#network-access-and-interfaces)
- [Installation and First-Run Flow](#installation-and-first-run-flow)
- [Actions](#actions)
- [Tasks](#tasks)
- [Health Checks](#health-checks)
- [Backups and Restore](#backups-and-restore)
- [Limitations and Differences](#limitations-and-differences)
- [Quick Reference for AI Consumers](#quick-reference-for-ai-consumers)

---

## Image and Container Runtime

Two upstream images run unmodified, each in its own subcontainer, both for x86_64 and aarch64.

| Subcontainer   | Image               | Runs                                                                                                                                                                                                     |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `castopod-sub` | `castopod/castopod` | The image's own entrypoint as PID 1: s6-overlay supervising FrankenPHP/Caddy on port 8080 and supercronic (Castopod's scheduled tasks every minute). Also hosts the `media-permissions` and `owner-account` one-shots. |
| `mariadb-sub`  | `mariadb`           | `mariadbd --bind-address=127.0.0.1` via the official entrypoint, with `MARIADB_AUTO_UPGRADE=1`. Also hosts the `database-grants` one-shot.                                                                 |
| `media-move-sub` | `castopod/castopod` | Only while a media move is queued: hosts the `media-move` one-shot, which runs the copy in a temporary `media-copy` subcontainer. Nothing else starts. |

On every start, in order: MariaDB starts; `database-grants` ensures the `castopod` database account exists for TCP connections from `127.0.0.1`; `media-permissions` (as root) creates the media folders and hands them to `www-data`; `owner-account` (as `www-data`) runs `spark install:init-database` (migrations + idempotent seeds) and creates the owner account if none exists; then Castopod starts. The image's own bootstrap rewrites `/app/.env` from `CP_*` variables and runs any pending migrations again.

Actions that touch accounts (`set-admin-password` rotation, `set-owner-email`) run Castopod's `spark` CLI in a temporary subcontainer of the Castopod image, against the running MariaDB.

While a media move is queued (see [Media storage](#media-storage)), a start runs only the `media-move` one-shot, which copies the media in a temporary subcontainer (`media-copy`) and then records the result; recording it restarts the service into the normal sequence above, or into the failure report. MariaDB does not start during a move.

## Volume and Data Layout

Two volumes; Castopod's `writable/` directory (cache, sessions, logs) stays in the container and is reset on every restart.

| Volume     | Mount point (subcontainer)              | Contents                                                                            |
| ---------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `main`     | `/var/www/html/public/media` (`castopod-sub`), subpath `media/`, while media storage is internal | All uploaded media: episode audio, transcripts, images, video clips. Grows with every episode. After media moves to another service, this holds the copy kept from before the move. |
| `main`     | — (StartOS side only)                   | `store.json`, the package's settings and secrets                                     |
| `database` | `/var/lib/mysql` (`mariadb-sub`)        | MariaDB data directory: podcasts, episodes, users, analytics, fediverse activity     |

### Media storage

`/var/www/html/public/media` (the image's `/app/public/media`; `/app` is a symlink, and StartOS cannot mount through one) is the only place Castopod writes files that matter, and it can live in one of four places, chosen with **Media Storage**:

| Location            | Mounted from                                       | Ownership                                                              |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Internal (default)  | `main` volume, subpath `media`                     | `www-data` (33), set by the `media-permissions` one-shot as root       |
| NextExplorer        | `nextexplorer`'s `data` volume, chosen folder      | idmapped: uid 1000 on disk is `www-data` (33) in the container          |
| FileBrowser Quantum | `filebrowser`'s `data` volume, chosen folder       | idmapped: uid 1000 on disk is `www-data` (33) in the container          |
| Nextcloud           | `nextcloud`'s `nextcloud` volume, `data/<account>/files/<folder>` | `www-data` (33) on both sides, no mapping                   |

External folders are mounted **read-write** at `/var/www/html/public/media`, so uploads land there and are visible in that service. The idmap is the one Nextcloud's own package uses for these two volumes. In an idmapped mount only mapped ids can create files, so everything the package writes there (the copy, the `media-permissions` folders) is written as `www-data`, never as root.

A folder the service cannot see is never mounted read-write: a read-write mount of a missing folder would recreate it, empty and root-owned. At each start the active external folder is first mounted read-only in a throwaway subcontainer, and Castopod refuses to start if that fails. NextExplorer shows a top-level folder as its own location (drive).

## File Models

The package owns one file, `store.json` on the `main` volume. It writes no Castopod configuration file of its own; Castopod is configured entirely through environment variables passed on every start.

`store.json` holds:

- `databasePassword`, `analyticsSalt` — generated once at first init and never changed. The salt anonymises listener IPs for analytics; changing it would split all statistics.
- `adminPassword`, `adminEmail` — written by the `set-admin-password` and `set-owner-email` actions, which also apply them to Castopod. `adminEmail` defaults to `admin@castopod.local`.
- `primaryUrl` — written by `set-primary-url`.
- `smtp`, `enable2fa` — written by `configure-smtp` and `toggle-2fa`.
- `mediaStorage` — where media lives: `{ "location": "internal" }` or `{ "location": "nextexplorer" | "filebrowser" | "nextcloud", "subfolder": "<path relative to that volume>" }`. Written by `media-storage` (recovery case only) and by the `media-move` one-shot when a copy succeeds. A value that does not parse falls back to internal.
- `mediaMove` — a queued copy `{ from, to, error }`, or `null`. Written by `media-storage`; cleared by a successful copy, or set to the failure message, which stops the copy from being retried on every start until the action is run again.

Hand edits to `store.json` survive, but the account fields are only read when the owner account is first created; editing them does not change the account.

Environment variables re-asserted on every start (the image's bootstrap writes most of them into `/app/.env`, which is regenerated each start, so a hand edit to `.env` never survives):

- `CP_BASEURL` — the primary URL. `CP_MEDIA_BASEURL` is left unset and follows it.
- `CP_DISABLE_HTTPS=1` — always. StartOS terminates TLS, and also serves Castopod on plain-HTTP `.onion` addresses; Castopod's own HTTPS redirect would loop.
- `CP_ANALYTICS_SALT`, `CP_DATABASE_*` — from `store.json`.
- `CP_ENABLE_2FA=true` — only while `enable2fa` is on.
- `email_protocol`, `email_SMTPHost`, `email_SMTPPort`, `email_SMTPCrypto`, `email_fromEmail`, `email_SMTPUser`, `email_SMTPPass` — CodeIgniter's own variables, read directly from the environment. The package does not use upstream's `CP_EMAIL_*` variables, because the bootstrap writes those into `.env` unquoted (breaking passwords with spaces or `#`) and refuses to start without a username and password.

The admin and auth gateways stay at upstream's defaults: `/cp-admin` and `/cp-auth`.

## Dependencies

Three optional dependencies, all for [media storage](#media-storage), none needed to run. MariaDB runs inside the package; Redis is not used.

| Dependency          | Package id     | Kind     | Volume       | Mounted                                                       |
| ------------------- | -------------- | -------- | ------------ | ------------------------------------------------------------- |
| NextExplorer        | `nextexplorer` | `exists` | `data`       | chosen folder at `/var/www/html/public/media`, read-write, idmapped     |
| FileBrowser Quantum | `filebrowser`  | `exists` | `data`       | chosen folder at `/var/www/html/public/media`, read-write, idmapped     |
| Nextcloud           | `nextcloud`    | `exists` | `nextcloud`  | `data/<account>/files/<folder>` at `/var/www/html/public/media`, read-write |

A dependency is declared only while media lives in that service or a queued move reads from or writes to it. No health checks are required: only the volume is used, so the other service need not be running.

## Network Access and Interfaces

Two interfaces on one port and one host, so they always share the same addresses; they differ only in path. Castopod's HTTPS port (8443) and Caddy's admin port (2019) are not exposed: StartOS provides TLS.

| Interface id | Name            | Type | Port | Path        | Serves                                                                          |
| ------------ | --------------- | ---- | ---- | ----------- | ------------------------------------------------------------------------------- |
| `ui`         | Podcast Website | `ui` | 8080 | `/`         | The public podcast website, RSS feeds, media files and ActivityPub endpoints    |
| `admin`      | Admin Area      | `ui` | 8080 | `/cp-admin` | Castopod's admin area; signed out, it redirects to the sign-in page at `/cp-auth/login` and back |

The split is for the user's benefit only: the paths are Castopod's own, and both interfaces reach the whole application. Exposing the website publicly exposes the admin area's sign-in page too, as it would upstream.

Castopod builds every absolute URL (feeds, enclosures, ActivityPub ids, redirects after login) from the primary URL, not from the address a request arrived on. Opening Castopod on another of its addresses works, but links and post-login redirects lead to the primary URL. Both interfaces' launch buttons open the primary URL (the admin one at its `/cp-admin` path), so signing in never bounces between hosts.

Castopod makes outbound connections itself: fediverse delivery to followers' servers, fetching remote avatars and posts, WebSub pings, and RSS imports.

## Installation and First-Run Flow

Upstream's `/cp-install` wizard is never reachable: the package creates the database schema and the owner account before Castopod serves its first request, and Castopod answers `/cp-install` with 404 once an owner exists.

1. Install raises the critical **Set Admin Password** task. Castopod cannot start until it is run.
2. Running it stores a generated password and shows it with the owner's sign-in email (`admin@castopod.local` until changed). The owner account is created on the next start, with username `admin`.
3. **Set Primary URL** is raised as an important task. Until it is chosen, Castopod uses the best available address (a public domain if one exists, otherwise `.local`).
4. Open the **Admin Area** interface and sign in **with the email**, not the username.

## Actions

Seven user-facing actions. None are hidden.

- **`set-admin-password`** — First run: only stores the password; the next start creates the owner account with it. Later runs (Castopod running): generate a new password, apply it with `spark shield:user password`, then store it. The old password stops working immediately. Takes a few seconds. Safe to repeat; each run replaces the password. Returns the sign-in email and password. Use it when the owner password is lost. Castopod's own "forgot password" email also works once SMTP is configured.
- **`set-owner-email`** — Changes the owner account's email with `spark shield:user changeemail` and stores it. Castopod's UI has no way to change an account email. Run it before relying on password-reset emails or enabling 2FA. Requires Castopod running. Idempotent. Fails if the address is already used by another Castopod account.
- **`set-primary-url`** — Chooses the address in `CP_BASEURL`; Castopod restarts. **Expensive after publishing**: feed and enclosure URLs already handed to podcast directories and apps point at the old address, and fediverse followers follow actor ids on the old host. Choose it once, before publishing.
- **`configure-smtp`** — Disabled, StartOS system SMTP, or custom. Castopod restarts. Needed for password resets, contributor invitations and email 2FA.
- **`media-storage`** — Chooses where media lives: internal, or a folder in NextExplorer, FileBrowser Quantum or Nextcloud. Validates before saving: the folder's parent must exist (so the service must be installed), the folder must be new or empty, it cannot be inside or contain the current folder, and a Nextcloud folder must be under `data/<account>/files/`. Then queues a copy: a running Castopod restarts at once, and every start runs the copy before anything else. **Cost:** a full copy of all media (`cp`, file count and size logged before and after); Castopod and MariaDB are down until it finishes. The old copy is never deleted. Choosing the current location cancels a queued or failed move. **Recovery:** if the current external folder cannot be reached, choosing internal switches back without copying, to whatever internal copy was kept (missing anything uploaded since). An interrupted copy leaves a `.castopod-copy-incomplete` marker in the destination; the next start clears that folder and copies again.
- **`delete-internal-media`** — Deletes the internal copy kept after media moved to another service (`main:media`). Run it once the other service is backed up, to shrink Castopod's backups. Irreversible; disabled while media is internal or a move is queued. Nothing else in the package deletes media; old copies in another service are left for the user to remove there.
- **`toggle-2fa`** — Turns Castopod's email two-factor authentication on or off; Castopod restarts. Refuses to enable while SMTP is disabled or the owner email is the placeholder. Once on, **every** sign-in for **every** account waits for an emailed code. If mail stops being delivered, nobody can sign in; running this action again turns it off. It is not an authenticator-app (TOTP) feature.

## Tasks

Two tasks.

- **Set Admin Password** — `critical`. Raised whenever `store.json` has no admin password, which is true after install. Blocks Castopod from starting. Cleared by running **Set Admin Password**. Comes back only if that field is removed from `store.json`.
- **Set Primary URL** — `important`. Raised when no primary URL is stored, or the stored one is no longer one of the interface's addresses (for example, a domain was removed). Cleared by running **Set Primary URL**, or by the stored address returning.

## Health Checks

Two checks, each with a 120-second grace period.

- **Database** — MariaDB is listening on `127.0.0.1:3306`. A failure past the grace period means MariaDB did not start; its log in the service logs explains why (usually disk full, or a failed auto-upgrade after an image bump).
- **Web Interface** — `GET http://127.0.0.1:8080/health` returns 200. Castopod's `/health` checks the database connection, the cache, and that the media folder is writable. A 503 after the grace period means one of those failed: check the log for a database or file-manager error. If the start sequence fails before Castopod launches (a one-shot exits non-zero), the log shows which one: `database-grants` (cannot authenticate to MariaDB as root), `media-permissions`, or `owner-account` (migration or seed error, printed from `spark`).

Start-up can also stop before any check runs, with an error in the service log naming the cause: a queued media move that failed (`Moving media from … failed: …`; fix it and rerun **Media Storage**), or an external media folder that cannot be reached (the service uninstalled, or the folder renamed or deleted; restore it, or run **Media Storage** and choose internal to fall back).

## Backups and Restore

Mixed strategy: the database is **dumped**, the media and settings are **copied**.

- `database` volume — `mariadb-dump` of the `castopod` database (`withMariadbDump`). Its files are not copied. Restore starts MariaDB on an empty data directory and replays the dump. That recreates the `castopod` account only for `localhost`, so the `database-grants` one-shot re-grants it for `127.0.0.1` and `%` on the next start.
- `main` volume — copied whole: internal media and `store.json`, so the owner credentials, primary URL, analytics salt, media-storage choice and settings come back as they were.
- **Media in another service is not in Castopod's backup.** It is backed up by NextExplorer, FileBrowser Quantum or Nextcloud. Restore that service's backup too, with the folder in place, before starting Castopod; otherwise Castopod refuses to start until the folder is back or Media Storage falls back to the internal copy. The internal copy kept after a move is still in Castopod's backup until **Delete Internal Media Copy** removes it.

Nothing is excluded except Castopod's in-container `writable/` (cache, sessions, logs), so sessions end after a restore. A restore onto a server with different addresses raises the **Set Primary URL** task again if the stored URL no longer belongs to the interface.

## Limitations and Differences

1. The install wizard (`/cp-install`) is never shown; the package creates the owner account.
2. Sign-in is by email. The owner's email is `admin@castopod.local` until changed with **Set Owner Email**, and can only be changed through that action.
3. Castopod has exactly one base URL. Feeds, media links and fediverse identities all use the primary URL, and changing it later breaks links already given out.
4. Fediverse federation needs the primary URL to be a public HTTPS domain. On a `.local` or `.onion` primary URL, other servers cannot reach Castopod, and podcast directories cannot fetch a `.local` feed.
5. Castopod's own HTTPS redirect is always off (`CP_DISABLE_HTTPS=1`); StartOS provides TLS.
6. Redis caching and S3 media storage are not offered. Media lives on the `main` volume or in a folder of NextExplorer, FileBrowser Quantum or Nextcloud.
7. Two-factor authentication is upstream's email-code variant only.
8. Upload size limits are upstream's defaults (512 MB per file).
9. Media written into Nextcloud's folders bypasses Nextcloud, so it does not appear in Nextcloud's web interface until Nextcloud rescans its files. Deleting or renaming files there from Nextcloud, NextExplorer or FileBrowser breaks the episodes that use them.
10. Changing media storage copies everything and takes Castopod down for the duration. Old copies are kept, so the space is needed twice until they are removed.
11. External media storage is storage only, not an import source. Castopod has no folder-scan or library feature; every media file needs a database record created by an upload through Castopod's UI or API. Files placed in the folder by hand are never picked up.

---

## Quick Reference for AI Consumers

```yaml
package_id: castopod
image: castopod/castopod
architectures: [x86_64, aarch64]
subcontainers: [castopod-sub, mariadb-sub, media-move-sub]
volumes:
  main: /var/www/html/public/media (subpath media/); store.json
  database: /var/lib/mysql
file_models:
  - store.json
startos_managed_env_vars:
  - CP_BASEURL
  - CP_DISABLE_HTTPS
  - CP_ANALYTICS_SALT
  - CP_DATABASE_HOSTNAME
  - CP_DATABASE_NAME
  - CP_DATABASE_USERNAME
  - CP_DATABASE_PASSWORD
  - CP_DATABASE_PREFIX
  - CP_ENABLE_2FA
  - email_protocol
  - email_SMTPHost
  - email_SMTPPort
  - email_SMTPCrypto
  - email_fromEmail
  - email_SMTPUser
  - email_SMTPPass
dependencies:
  - nextexplorer # optional; media storage
  - filebrowser # optional; media storage
  - nextcloud # optional; media storage
interfaces:
  ui: { type: ui, port: 8080 } # path /
  admin: { type: ui, port: 8080 } # path /cp-admin
actions:
  - set-admin-password
  - set-owner-email
  - set-primary-url
  - configure-smtp
  - toggle-2fa
  - media-storage
  - delete-internal-media
tasks:
  - { action: set-admin-password, severity: critical }
  - { action: set-primary-url, severity: important }
health_checks:
  - mariadb
  - castopod
```
