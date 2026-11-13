import { T } from '@start9labs/start-sdk'
import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import {
  addFeed,
  capitalize,
  describeFeed,
  directories,
  DirectoryId,
  feedUrlFor,
  getFeedById,
  getFeedByUrl,
  listPodcasts,
  notifyFeedChanged,
  PodcastIndexError,
  podcastIndexPage,
  CastopodPodcast,
  unreachableReason,
} from '../podcastIndex'
import { primaryUrl } from '../primaryUrl'
import { sdk } from '../sdk'

const directoryLabels = Object.fromEntries(
  Object.entries(directories).map(([id, d]) => [id, d.label]),
) as Record<DirectoryId, string>

async function podcastsOrNull(
  effects: T.Effects,
): Promise<CastopodPodcast[] | null> {
  const password = await storeJson.read((s) => s.databasePassword).once()
  if (!password) return null
  try {
    return await listPodcasts(effects, password, { publishedOnly: true })
  } catch {
    return null
  }
}

const inputSpec = sdk.InputSpec.of({
  podcast: sdk.Value.dynamicSelect(async ({ effects }) => {
    const podcasts = await podcastsOrNull(effects)
    const base = {
      name: i18n('Podcast'),
      description: i18n(
        'Only published podcasts are listed: a podcast has no public feed until it is published.',
      ),
    }
    if (!podcasts?.length) {
      return {
        ...base,
        default: 'none',
        values: { none: i18n('No published podcasts') },
        disabled: podcasts
          ? i18n('Publish a podcast in Castopod first.')
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
  directories: sdk.Value.multiselect({
    name: i18n('Other directories'),
    description: i18n(
      'Apple Podcasts, Spotify and the other large directories cannot be submitted to automatically. Pick the ones you want, and the result links to the page where each one takes a feed URL.',
    ),
    default: ['apple', 'spotify'],
    values: directoryLabels,
  }),
})

export const submitPodcastIndex = sdk.Action.withInput(
  'submit-podcast-index',

  async ({ effects }) => {
    const pi = await storeJson.read((s) => s.podcastIndex).const(effects)
    return {
      name: i18n('Submit to Podcast Index'),
      description: i18n(
        'Add a published podcast to Podcast Index, the open directory many podcast apps search, and get links for submitting it to other directories. Running it again for the same podcast asks Podcast Index to re-read the feed and shows its status.',
      ),
      warning: null,
      allowedStatuses: 'only-running',
      group: i18n('Podcasting 2.0'),
      visibility:
        pi?.apiKey && pi.apiSecret
          ? 'enabled'
          : { disabled: i18n('Run Configure Podcast Index first.') },
    }
  },

  inputSpec,

  async () => ({}),

  async ({ effects, input }) => {
    const store = await storeJson.read().once()
    const apiKey = store?.podcastIndex.apiKey
    const apiSecret = store?.podcastIndex.apiSecret
    if (!store?.databasePassword || !apiKey || !apiSecret) {
      throw new Error(i18n('Run Configure Podcast Index first.'))
    }
    const creds = { apiKey, apiSecret }

    const podcasts = await listPodcasts(effects, store.databasePassword, {
      publishedOnly: true,
    })
    const podcast = podcasts.find((p) => p.guid === input.podcast)
    if (!podcast) throw new Error(i18n('Publish a podcast in Castopod first.'))

    const baseUrl = await primaryUrl.bestUsable(effects).once()
    if (!baseUrl) {
      throw new Error(i18n('Castopod has no address to use as its primary URL'))
    }
    const host = unreachableReason(baseUrl)
    if (host) {
      throw new Error(
        i18n(
          'Podcast Index can only read feeds on a public internet address, but Castopod publishes at ${host}. Add a public domain to the Podcast Website interface, choose it with Set Primary URL, then try again.',
          { host },
        ),
      )
    }
    const feedUrl = feedUrlFor(baseUrl, podcast.handle)

    // Look first: that call is read-only, so a podcast already listed (for
    // example added by hand at podcastindex.org/add) works with the default
    // read-only key. Only an unlisted feed needs the write permission.
    let feedId: number
    let existed: boolean
    const listed = await getFeedByUrl(creds, feedUrl)
    if (listed) {
      feedId = listed.id
      existed = true
    } else {
      try {
        ;({ feedId, existed } = await addFeed(creds, feedUrl))
      } catch (e) {
        if (
          e instanceof PodcastIndexError &&
          (e.kind === 'unauthorized' || e.kind === 'refused')
        ) {
          throw new Error(
            `${e.message} ${i18n(
              'New Podcast Index API keys are read-only and cannot add podcasts. Add it yourself at https://podcastindex.org/add with the feed URL ${url} (no account needed), wait a few minutes, then run this action again: it finds the listing and tracks it. Or ask Podcast Index to give your key write access.',
              { url: feedUrl },
            )}`,
          )
        }
        throw e
      }
    }
    await notifyFeedChanged({ id: feedId })
    await storeJson.merge(effects, {
      podcastIndex: {
        submitted: {
          [podcast.guid]: {
            handle: podcast.handle,
            title: podcast.title,
            feedId,
          },
        },
      },
    })

    let status: string
    try {
      status = capitalize(
        describeFeed(await getFeedById(creds, feedId), feedUrl).message,
      )
    } catch (e) {
      status = String((e as Error)?.message ?? e)
    }

    const chosen = input.directories as DirectoryId[]
    const message = [
      existed
        ? i18n(
            'Podcast Index already had this feed and has been asked to read it again.',
          )
        : i18n(
            'Podcast Index added this feed. It usually reads it within minutes; the Podcast Index health check shows when it is indexed.',
          ),
      i18n(
        'Apps that search Podcast Index, such as Fountain, Podverse, Castamatic, Podcast Guru and AntennaPod, find the podcast once it is indexed.',
      ),
      chosen.length
        ? i18n(
            'The directories below need the feed submitted by hand: open each link, sign in, and paste the feed URL. Once a listing is live, add its link in the Castopod admin under Broadcast → Podcasting apps, so it shows on your podcast page.',
          )
        : '',
    ]
      .filter(Boolean)
      .join(' ')

    const single = (
      name: string,
      value: string,
      launchable: boolean,
      description: string | null = null,
    ): T.ActionResultMember => ({
      type: 'single',
      name,
      description,
      value,
      masked: false,
      copyable: true,
      qr: false,
      launchable,
    })

    return {
      version: '1',
      title: podcast.title,
      message,
      result: {
        type: 'group',
        value: [
          single(i18n('Podcast Index status'), status, false),
          single(i18n('Feed URL'), feedUrl, false),
          single(i18n('Podcast Index page'), podcastIndexPage(feedId), true),
          ...chosen.map((id) =>
            single(
              directories[id].label,
              directories[id].url,
              true,
              directories[id].note ?? null,
            ),
          ),
        ],
      },
    }
  },
)
