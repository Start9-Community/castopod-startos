import { T } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import {
  resolveLightningAddress,
  setLightningValue,
  valueXml,
} from '../lightning'
import { CastopodPodcast, listPodcasts } from '../podcastIndex'
import { sdk } from '../sdk'

async function podcastsOrNull(
  effects: T.Effects,
): Promise<CastopodPodcast[] | null> {
  const password = await storeJson.read((s) => s.databasePassword).once()
  if (!password) return null
  try {
    return await listPodcasts(effects, password, { publishedOnly: false })
  } catch {
    return null
  }
}

const inputSpec = sdk.InputSpec.of({
  podcast: sdk.Value.dynamicSelect(async ({ effects }) => {
    const podcasts = await podcastsOrNull(effects)
    const base = { name: i18n('Podcast'), description: null }
    if (!podcasts?.length) {
      return {
        ...base,
        default: 'none',
        values: { none: i18n('No podcasts') },
        disabled: podcasts
          ? i18n('Create a podcast in Castopod first.')
          : i18n('Could not read the list of podcasts from the database.'),
      }
    }
    return {
      ...base,
      default: podcasts[0].guid,
      values: Object.fromEntries(
        podcasts.map((p) => [p.guid, `${p.title} (@${p.handle})`]),
      ),
    }
  }),
  address: sdk.Value.text({
    name: i18n('Lightning Address'),
    description: i18n(
      "Where listeners' payments go, such as name@getalby.com or name@fountain.fm. The wallet receives 100% of payments. Leave empty to remove the podcast's Lightning address.",
    ),
    required: false,
    default: null,
    placeholder: 'name@getalby.com',
  }),
})

export const setLightningAddress = sdk.Action.withInput(
  'set-lightning-address',

  async ({ effects }) => ({
    name: i18n('Set Lightning Address'),
    description: i18n(
      "Add a Lightning address to a podcast's feed, so listeners can send value-for-value payments (boosts and streamed sats) from apps such as Fountain, Podverse and Castamatic.",
    ),
    warning: i18n(
      'Castopod restarts to publish the change: it is unreachable for about a minute, and everyone signed in to Castopod is signed out.',
    ),
    allowedStatuses: 'only-running',
    group: i18n('Podcasting 2.0'),
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({}),

  async ({ effects, input }) => {
    const store = await storeJson.read().once()
    if (!store?.databasePassword) {
      throw new Error('Castopod database password is missing')
    }
    const podcasts = await listPodcasts(effects, store.databasePassword, {
      publishedOnly: false,
    })
    const podcast = podcasts.find((p) => p.guid === input.podcast)
    if (!podcast) throw new Error(i18n('Create a podcast in Castopod first.'))

    const recipient = input.address?.trim()
      ? await resolveLightningAddress(input.address)
      : null

    const { hadValue } = await setLightningValue(
      effects,
      store.databasePassword,
      podcast.guid,
      recipient,
    )
    if (!recipient && !hadValue) {
      return {
        version: '1',
        title: podcast.title,
        message: i18n(
          'This podcast had no Lightning address. Nothing changed.',
        ),
        result: null,
      }
    }

    // Castopod caches the feed inside its container for years, so only a
    // restart (which starts from a fresh filesystem) publishes the change.
    // Bumping feedRevision restarts main; the health check pings Podcast
    // Index once Castopod is back.
    await storeJson.merge(effects, {
      feedRevision: store.feedRevision + 1,
      podcastIndex: { notify: { [podcast.handle]: true } },
    })

    if (!recipient) {
      return {
        version: '1',
        title: podcast.title,
        message: i18n(
          'The Lightning address was removed from the feed. Castopod is restarting to publish the change.',
        ),
        result: null,
      }
    }

    const message = [
      i18n(
        'Castopod is restarting to publish the change. Apps pick it up the next time they refresh the feed.',
      ),
      recipient.kind === 'keysend'
        ? i18n(
            'The address was resolved to its wallet node, the form every value-for-value app can pay. If the wallet ever changes its node, run this action again.',
          )
        : i18n(
            'This wallet does not publish keysend details, so the feed names the Lightning address directly. Fewer apps can pay this form; a wallet such as Alby or Fountain works with all of them.',
          ),
      i18n(
        "The block is stored in the podcast's Custom RSS tags in Castopod. Edit or remove it there, or with this action.",
      ),
    ].join(' ')

    return {
      version: '1',
      title: podcast.title,
      message,
      result: {
        type: 'single',
        name: i18n('Added to the feed'),
        description: null,
        value: valueXml(recipient),
        masked: false,
        copyable: true,
        qr: false,
        launchable: false,
      },
    }
  },
)
