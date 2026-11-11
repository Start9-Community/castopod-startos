import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { defaultAdminEmail } from '../utils'

// Castopod's 2FA is Shield's Email2FA: every sign-in, by every user, waits
// for a code sent by email. Without working mail nobody can sign in.
export const toggle2fa = sdk.Action.withoutInput(
  'toggle-2fa',

  async ({ effects }) => {
    const enabled = await storeJson.read((s) => s.enable2fa).const(effects)
    return {
      name: enabled
        ? i18n('Disable Email Two-Factor Authentication')
        : i18n('Enable Email Two-Factor Authentication'),
      description: enabled
        ? i18n(
            'Email two-factor authentication is on: every sign-in requires a code sent to the account email. Turn it off here if mail stops arriving.',
          )
        : i18n(
            'Require a code sent by email on every sign-in, for every account. Needs SMTP configured and a real owner email.',
          ),
      warning: enabled
        ? null
        : i18n(
            'If email delivery fails, nobody can sign in to Castopod until this is turned off again. Send yourself a password-reset email first to confirm mail works.',
          ),
      allowedStatuses: 'any',
      group: null,
      visibility: 'enabled',
    }
  },

  async ({ effects }) => {
    const store = await storeJson.read().once()
    if (!store) throw new Error('Store not found')
    if (!store.enable2fa) {
      if (store.smtp.selection === 'disabled') {
        throw new Error(
          i18n('Configure SMTP before enabling two-factor authentication.'),
        )
      }
      if (store.adminEmail === defaultAdminEmail) {
        throw new Error(
          i18n(
            'Set a real owner email with Set Owner Email before enabling two-factor authentication.',
          ),
        )
      }
    }
    await storeJson.merge(effects, { enable2fa: !store.enable2fa })
  },
)
