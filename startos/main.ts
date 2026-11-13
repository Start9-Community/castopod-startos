import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import {
  copyMedia,
  describeStorage,
  listProviderFolder,
  mediaMounts,
  mediaPath,
  providerTitles,
} from './mediaStorage'
import { podcastIndexHealth, podcastIndexTrigger } from './podcastIndex'
import { primaryUrl } from './primaryUrl'
import { sdk } from './sdk'
import {
  adminUsername,
  cliDatabaseEnv,
  databaseName,
  databasePort,
  databasePrefix,
  databaseUser,
  uiPort,
} from './utils'

// The image's MARIADB_USER account is `castopod@'%'`, but a data directory
// rebuilt from a backup dump only carries `castopod@localhost`. Castopod
// connects over TCP to 127.0.0.1, so make sure an account it can reach exists.
const grantSql = `
  CREATE USER IF NOT EXISTS '${databaseUser}'@'%' IDENTIFIED BY '$DB_PASSWORD';
  ALTER USER '${databaseUser}'@'%' IDENTIFIED BY '$DB_PASSWORD';
  GRANT ALL PRIVILEGES ON ${databaseName}.* TO '${databaseUser}'@'%';
  CREATE USER IF NOT EXISTS '${databaseUser}'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
  ALTER USER '${databaseUser}'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
  GRANT ALL PRIVILEGES ON ${databaseName}.* TO '${databaseUser}'@'127.0.0.1';
`
const grantScript = `
set -eu
i=0
until MYSQL_PWD="$DB_PASSWORD" mariadb --protocol=socket -u root -e "${grantSql}"; do
  i=$((i + 1)); [ "$i" -ge 30 ] && { echo "could not authenticate to MariaDB as root" >&2; exit 1; }
  sleep 2
done
`

// Castopod runs as www-data and expects these folders (the index.html files
// block directory listings). Internal storage starts root-owned, so this runs
// as root there and hands it to www-data; external storage is idmapped, where
// only www-data can create files, so it runs as www-data there.
const mediaScript = `
set -eu
for d in . persons podcasts site; do
  mkdir -p "${mediaPath}/$d"
  [ -e "${mediaPath}/$d/index.html" ] || \\
    printf '<!DOCTYPE html><html><head><title>403 Forbidden</title></head><body><p>Directory access is forbidden.</p></body></html>' > "${mediaPath}/$d/index.html"
done
if [ "$(id -u)" = 0 ]; then
  chown -R www-data:www-data ${mediaPath}
  chmod 770 ${mediaPath}
fi
`

// Replaces the image's bootstrap `up`, whose closing `cat .env` logs the database password and salt.
const bootstrapDir = '/etc/s6-overlay/s6-rc.d/bootstrap'
const bootstrapScript = `#!/command/with-contenv sh
{ ${bootstrapDir}/prepare-environment.sh; echo $? > /tmp/bootstrap-status; } 2>&1 \\
  | sed -u -E 's/^([A-Za-z0-9_.]*([Pp]ass(word)?|salt|secret)=).*/\\1<redacted>/'
exit "$(cat /tmp/bootstrap-status)"
`

// Creates the schema and seed data, then the owner account, before Castopod
// serves its first request, so the /cp-install wizard (which hands the
// instance to whoever opens it first) is never reachable. Both steps are
// idempotent. Shield's prompts echo the password, so their output is
// discarded.
const ownerScript = `
set -u
cd /app
php spark install:init-database > /tmp/init.log 2>&1 || { tail -n 20 /tmp/init.log >&2; exit 1; }
printf '%s\\n%s\\n' "$ADMIN_PASSWORD" "$ADMIN_PASSWORD" \\
  | php spark install:create-superadmin -n "$ADMIN_USERNAME" -e "$ADMIN_EMAIL" > /tmp/owner.log 2>&1
if grep -q 'already created' /tmp/owner.log; then
  echo "Castopod owner account already exists"
elif grep -q 'created' /tmp/owner.log; then
  echo "Created the Castopod owner account"
else
  grep -v -i 'password' /tmp/owner.log | tail -n 10 >&2
  exit 1
fi
`

export const main = sdk.setupMain(async ({ effects }) => {
  console.info(i18n('Starting Castopod!'))

  // Podcast Index settings and submissions are read by the actions and the
  // health check directly; leaving them out here keeps a submission from
  // restarting Castopod.
  const store = await storeJson
    .read((s) => ({ ...s, podcastIndex: undefined }))
    .const(effects)
  if (!store?.databasePassword || !store.analyticsSalt) {
    throw new Error('Castopod internal secrets have not been initialized')
  }
  if (!store.adminPassword) {
    throw new Error(i18n('The Castopod owner password has not been set'))
  }
  const { databasePassword, analyticsSalt, adminPassword } = store

  // A queued storage change: copy the media before anything else starts.
  // Writing the outcome to the store restarts main, into normal operation or
  // into the failure report below.
  const move = store.mediaMove
  if (move?.error) {
    throw new Error(
      i18n(
        'Moving media from ${from} to ${to} failed: ${error}. Fix the problem and run Media Storage again to retry, or choose the current location to cancel.',
        {
          from: describeStorage(move.from),
          to: describeStorage(move.to),
          error: move.error,
        },
      ),
    )
  }
  if (move) {
    return sdk.Daemons.of(effects).addOneshot('media-move', {
      subcontainer: sdk.SubContainer.of(
        effects,
        { imageId: 'castopod' },
        sdk.Mounts.of(),
        'media-move-sub',
      ),
      exec: {
        fn: async () => {
          console.info(
            `Moving media from ${describeStorage(move.from)} to ${describeStorage(move.to)}`,
          )
          try {
            await copyMedia(effects, move)
            await storeJson.merge(effects, {
              mediaStorage: move.to,
              mediaMove: null,
            })
          } catch (e) {
            await storeJson.merge(effects, {
              mediaMove: { ...move, error: String((e as Error)?.message ?? e) },
            })
          }
          return null
        },
      },
      requires: [],
    })
  }

  // Never let a missing external folder be mounted read-write: StartOS would
  // recreate it empty and root-owned, and Castopod would serve no media.
  const storage = store.mediaStorage
  if (
    storage.location !== 'internal' &&
    (await listProviderFolder(effects, storage.location, storage.subfolder)) ===
      null
  ) {
    throw new Error(
      i18n(
        'Castopod stores its media in ${library}, but the folder "${subfolder}" cannot be reached. Install ${library} or restore the folder, or run Media Storage to switch back to internal storage.',
        {
          library: providerTitles[storage.location],
          subfolder: storage.subfolder,
        },
      ),
    )
  }

  const baseUrl = await primaryUrl.bestUsable(effects).const()
  if (!baseUrl) {
    throw new Error(i18n('Castopod has no address to use as its primary URL'))
  }

  let smtp: T.SmtpValue | null = null
  if (store.smtp.selection === 'system') {
    const system = await sdk.getSystemSmtp(effects).const()
    if (system) {
      smtp = { ...system, from: store.smtp.value.customFrom || system.from }
    }
  } else if (store.smtp.selection === 'custom') {
    const { host, from, username, password, security } =
      store.smtp.value.provider.value
    smtp = {
      host,
      from,
      username,
      password,
      port: Number(security.value.port),
      security: security.selection,
    }
  }

  // Passed straight to CodeIgniter rather than through upstream's CP_EMAIL_*
  // variables, which its bootstrap writes into .env unquoted, and which it
  // refuses to start without a username and password.
  const fromName = smtp?.from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/)?.[1]
  const emailEnv: Record<string, string> = smtp
    ? {
        email_protocol: 'smtp',
        email_SMTPHost: smtp.host,
        email_SMTPPort: String(smtp.port),
        // CodeIgniter: 'ssl' is implicit TLS, 'tls' is STARTTLS.
        email_SMTPCrypto: smtp.security === 'tls' ? 'ssl' : 'tls',
        email_fromEmail: smtp.from,
        ...(fromName ? { email_fromName: fromName } : {}),
        ...(smtp.username ? { email_SMTPUser: smtp.username } : {}),
        ...(smtp.password ? { email_SMTPPass: smtp.password } : {}),
      }
    : {}

  const mariadb = sdk.SubContainer.of(
    effects,
    { imageId: 'mariadb' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'database',
      subpath: null,
      mountpoint: '/var/lib/mysql',
      readonly: false,
    }),
    'mariadb-sub',
  )

  const castopod = sdk.SubContainer.of(
    effects,
    { imageId: 'castopod' },
    mediaMounts(storage),
    'castopod-sub',
  )
  await castopod.writeFile(`${bootstrapDir}/redacted-up.sh`, bootstrapScript, {
    mode: 0o755,
  })
  await castopod.writeFile(
    `${bootstrapDir}/up`,
    `${bootstrapDir}/redacted-up.sh\n`,
  )

  return sdk.Daemons.of(effects)
    .addDaemon('mariadb', {
      subcontainer: mariadb,
      exec: {
        command: sdk.useEntrypoint(['mariadbd', '--bind-address=127.0.0.1']),
        runAsInit: true,
        env: {
          MARIADB_ROOT_PASSWORD: databasePassword,
          MARIADB_DATABASE: databaseName,
          MARIADB_USER: databaseUser,
          MARIADB_PASSWORD: databasePassword,
          MARIADB_AUTO_UPGRADE: '1',
        },
      },
      ready: {
        display: i18n('Database'),
        gracePeriod: 120000,
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, databasePort, {
            successMessage: i18n('MariaDB is ready'),
            errorMessage: i18n('MariaDB is not ready'),
          }),
      },
      requires: [],
    })
    .addOneshot('database-grants', {
      subcontainer: mariadb,
      exec: {
        command: ['sh', '-c', grantScript],
        user: 'root',
        env: { DB_PASSWORD: databasePassword },
      },
      requires: ['mariadb'],
    })
    .addOneshot('media-permissions', {
      subcontainer: castopod,
      exec: {
        command: ['sh', '-c', mediaScript],
        user: storage.location === 'internal' ? 'root' : 'www-data',
      },
      requires: [],
    })
    .addOneshot('owner-account', {
      subcontainer: castopod,
      exec: {
        command: ['sh', '-c', ownerScript],
        user: 'www-data',
        env: {
          ...cliDatabaseEnv(databasePassword),
          ADMIN_USERNAME: adminUsername,
          ADMIN_EMAIL: store.adminEmail,
          ADMIN_PASSWORD: adminPassword,
        },
      },
      requires: ['database-grants', 'media-permissions'],
    })
    .addDaemon('castopod', {
      subcontainer: castopod,
      exec: {
        command: sdk.useEntrypoint(),
        runAsInit: true,
        env: {
          CP_BASEURL: baseUrl,
          // StartOS terminates TLS in front of Castopod and also serves it on
          // plain-HTTP .onion addresses; the in-app HTTPS redirect would loop.
          CP_DISABLE_HTTPS: '1',
          CP_ANALYTICS_SALT: analyticsSalt,
          CP_DATABASE_HOSTNAME: '127.0.0.1',
          CP_DATABASE_NAME: databaseName,
          CP_DATABASE_USERNAME: databaseUser,
          CP_DATABASE_PASSWORD: databasePassword,
          CP_DATABASE_PREFIX: databasePrefix,
          ...(store.enable2fa ? { CP_ENABLE_2FA: 'true' } : {}),
          ...emailEnv,
        },
      },
      ready: {
        display: i18n('Web Interface'),
        gracePeriod: 120000,
        fn: () =>
          sdk.healthCheck.checkWebUrl(
            effects,
            `http://127.0.0.1:${uiPort}/health`,
            {
              successMessage: i18n('Castopod is ready'),
              errorMessage: i18n('Castopod is not ready'),
            },
          ),
      },
      requires: ['owner-account'],
    })
    .addHealthCheck('podcast-index', {
      ready: {
        display: i18n('Podcast Index'),
        trigger: podcastIndexTrigger,
        fn: podcastIndexHealth(effects, baseUrl),
      },
      requires: ['castopod'],
    })
})
