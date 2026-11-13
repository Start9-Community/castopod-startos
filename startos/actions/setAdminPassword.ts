import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import {
  adminUsername,
  defaultAdminEmail,
  cliDatabaseEnv,
  randomSecret,
} from '../utils'

// Shield asks to confirm, then for the password twice. Its prompts echo what
// they read, so the output is discarded rather than logged.
const rotateScript = `
cd /app
printf 'y\\n%s\\n%s\\n' "$ADMIN_PASSWORD" "$ADMIN_PASSWORD" \\
  | php spark shield:user password -n "$ADMIN_USERNAME" > /tmp/out 2>&1
status=$?
if [ "$status" -ne 0 ] || ! grep -q 'Password for .* set' /tmp/out; then
  grep -v -i 'password :' /tmp/out | tail -n 5 >&2
  exit 1
fi
`

export const setAdminPassword = sdk.Action.withoutInput(
  'set-admin-password',

  async ({ effects }) => {
    const first = !(await storeJson.read((s) => s.adminPassword).const(effects))
    return {
      name: i18n('Set Admin Password'),
      description: first
        ? i18n(
            'Generate the password for the Castopod owner account. The account is created with it when Castopod next starts.',
          )
        : i18n(
            'Generate a new password for the Castopod owner account and apply it.',
          ),
      warning: first
        ? null
        : i18n('Replaces the current owner account password.'),
      allowedStatuses: first ? 'any' : 'only-running',
      group: i18n('Owner Account'),
      visibility: 'enabled',
    }
  },

  async ({ effects }) => {
    const store = await storeJson.read().once()
    const adminPassword = randomSecret(32)

    if (store?.adminPassword) {
      if (!store.databasePassword) {
        throw new Error('Castopod database password is missing')
      }
      await sdk.SubContainer.withTemp(
        effects,
        { imageId: 'castopod' },
        sdk.Mounts.of(),
        'rotate-admin-password',
        async (sub) => {
          const res = await sub.exec(['sh', '-c', rotateScript], {
            user: 'www-data',
            env: {
              ...cliDatabaseEnv(store.databasePassword!),
              ADMIN_USERNAME: adminUsername,
              ADMIN_PASSWORD: adminPassword,
            },
          })
          if (res.exitCode !== 0) {
            throw new Error(
              `${i18n('Castopod refused the new password.')} ${String(res.stderr)}`,
            )
          }
        },
      )
    }

    await storeJson.merge(effects, { adminPassword })

    return {
      version: '1',
      title: i18n('Castopod Owner Account'),
      message: i18n(
        'Sign in with this email and password. Save the password now: running this action again replaces it.',
      ),
      result: {
        type: 'group',
        value: [
          {
            type: 'single',
            name: i18n('Email'),
            description: null,
            value: store?.adminEmail ?? defaultAdminEmail,
            masked: false,
            copyable: true,
            qr: false,
            launchable: false,
          },
          {
            type: 'single',
            name: i18n('Password'),
            description: null,
            value: adminPassword,
            masked: true,
            copyable: true,
            qr: false,
            launchable: false,
          },
        ],
      },
    }
  },
)
