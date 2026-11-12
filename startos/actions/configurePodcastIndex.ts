import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { PodcastIndexError, verifyCredentials } from '../podcastIndex'
import { sdk } from '../sdk'

const inputSpec = sdk.InputSpec.of({
  apiKey: sdk.Value.text({
    name: i18n('API Key'),
    description: i18n(
      'From your free account at api.podcastindex.org. New keys are read-only: they track podcasts already in Podcast Index, including ones you add at podcastindex.org/add. Adding podcasts from here needs write access, which Podcast Index grants on request. Leave both fields empty to remove the key.',
    ),
    required: false,
    default: null,
  }),
  apiSecret: sdk.Value.text({
    name: i18n('API Secret'),
    description: null,
    required: false,
    default: null,
    masked: true,
  }),
})

export const configurePodcastIndex = sdk.Action.withInput(
  'configure-podcast-index',

  async ({ effects }) => ({
    name: i18n('Configure Podcast Index'),
    description: i18n(
      'Enter your Podcast Index API key and secret, so Castopod can add your podcasts to Podcast Index and check how they are indexed.',
    ),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects }) => {
    const pi = await storeJson.read((s) => s.podcastIndex).once()
    return {
      apiKey: pi?.apiKey ?? undefined,
      apiSecret: pi?.apiSecret ?? undefined,
    }
  },

  async ({ effects, input }) => {
    const apiKey = input.apiKey?.trim() || null
    const apiSecret = input.apiSecret?.trim() || null
    if (!!apiKey !== !!apiSecret) {
      throw new Error(i18n('Enter both the API key and the API secret.'))
    }
    // Checked now, so a typo shows here rather than later in a health check.
    // Only a refused key blocks saving; an outage or firewall block does not.
    let unchecked: string | null = null
    if (apiKey && apiSecret) {
      try {
        await verifyCredentials({ apiKey, apiSecret })
      } catch (e) {
        if (!(e instanceof PodcastIndexError) || e.kind === 'unauthorized')
          throw e
        unchecked = e.message
      }
    }
    await storeJson.merge(effects, { podcastIndex: { apiKey, apiSecret } })
    if (!unchecked) return
    return {
      version: '1' as const,
      title: i18n('Configure Podcast Index'),
      message: i18n('Saved, but the key could not be checked: ${error}', {
        error: unchecked,
      }),
      result: null,
    }
  },
)
