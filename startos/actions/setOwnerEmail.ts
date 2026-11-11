import { utils } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { adminUsername, cliDatabaseEnv } from '../utils'

const inputSpec = sdk.InputSpec.of({
  email: sdk.Value.text({
    name: i18n('Email'),
    description: i18n(
      'You sign in with this address, and Castopod sends password-reset links and two-factor codes to it.',
    ),
    required: true,
    default: null,
    patterns: [utils.Patterns.email],
  }),
})

// Castopod's own UI cannot change an account's email; Shield's CLI can.
const changeScript = `
cd /app
php spark shield:user changeemail -n "$ADMIN_USERNAME" --new-email "$NEW_EMAIL" < /dev/null > /tmp/out 2>&1
if [ $? -ne 0 ] || ! grep -q 'changed to' /tmp/out; then
  tail -n 5 /tmp/out >&2
  exit 1
fi
`

export const setOwnerEmail = sdk.Action.withInput(
  'set-owner-email',

  async ({ effects }) => ({
    name: i18n('Set Owner Email'),
    description: i18n(
      'Change the email address of the Castopod owner account. You sign in with it, and password resets and two-factor codes are sent to it.',
    ),
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects }) => ({
    email: (await storeJson.read((s) => s.adminEmail).once()) ?? undefined,
  }),

  async ({ effects, input }) => {
    const store = await storeJson.read().once()
    if (!store?.databasePassword) {
      throw new Error('Castopod database password is missing')
    }
    if (input.email === store.adminEmail) return

    await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'castopod' },
      sdk.Mounts.of(),
      'set-owner-email',
      async (sub) => {
        const res = await sub.exec(['sh', '-c', changeScript], {
          user: 'www-data',
          env: {
            ...cliDatabaseEnv(store.databasePassword!),
            ADMIN_USERNAME: adminUsername,
            NEW_EMAIL: input.email,
          },
        })
        if (res.exitCode !== 0) {
          throw new Error(
            `${i18n('Castopod refused the new email address.')} ${String(res.stderr)}`,
          )
        }
      },
    )

    await storeJson.merge(effects, { adminEmail: input.email })
  },
)
