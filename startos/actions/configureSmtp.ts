import { smtpPrefill } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const inputSpec = sdk.InputSpec.of({
  smtp: sdk.inputSpecConstants.smtpInputSpec,
})

export const configureSmtp = sdk.Action.withInput(
  'configure-smtp',

  async ({ effects }) => ({
    name: i18n('Configure SMTP'),
    description: i18n(
      'Let Castopod send email: password resets, contributor invitations and notifications.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects }) => ({
    smtp: smtpPrefill(await storeJson.read((s) => s.smtp).once()),
  }),

  async ({ effects, input }) => storeJson.merge(effects, { smtp: input.smtp }),
)
