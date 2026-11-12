import { createHash } from 'crypto'
import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { databasePrefix, runSql } from './utils'

// https://podcastindex-org.github.io/docs-api/
const apiBase = 'https://api.podcastindex.org/api/1.0'
const userAgent = 'castopod-startos'
const requestTimeoutMs = 20_000

export type PodcastIndexCredentials = { apiKey: string; apiSecret: string }

/**
 * - `unreachable`: network error or timeout
 * - `blocked`: Cloudflare answered instead of the API
 * - `unauthorized`: the key or secret was refused, or lacks a permission
 * - `refused`: the API answered but did not do what was asked
 */
export type PodcastIndexErrorKind =
  | 'unreachable'
  | 'blocked'
  | 'unauthorized'
  | 'refused'

export class PodcastIndexError extends Error {
  constructor(
    message: string,
    readonly kind: PodcastIndexErrorKind,
  ) {
    super(message)
  }
}

// Every authenticated call signs the key, secret and current time:
// Authorization = sha1(key + secret + unixTime), valid for a few minutes.
async function request(
  path: string,
  params: Record<string, string>,
  creds: PodcastIndexCredentials | null,
  method: 'GET' | 'POST' = 'GET',
): Promise<any> {
  const url = new URL(apiBase + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const headers: Record<string, string> = { 'User-Agent': userAgent }
  if (creds) {
    const date = Math.floor(Date.now() / 1000).toString()
    headers['X-Auth-Key'] = creds.apiKey
    headers['X-Auth-Date'] = date
    headers['Authorization'] = createHash('sha1')
      .update(creds.apiKey + creds.apiSecret + date)
      .digest('hex')
  }
  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(params).toString()
  }

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
  } catch (e) {
    throw new PodcastIndexError(
      i18n('Could not reach Podcast Index: ${error}', {
        error: String((e as Error)?.message ?? e),
      }),
      'unreachable',
    )
  }

  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {}
  const description =
    typeof json?.description === 'string' ? json.description : ''

  // Podcast Index sits behind Cloudflare, which can answer a request it
  // distrusts with an HTML challenge page instead of the API. That says
  // nothing about the key, so it must not be reported as a rejected key.
  if (json === null && /<html/i.test(text)) {
    throw new PodcastIndexError(
      i18n(
        "Podcast Index's firewall blocked the request from this server (HTTP ${status}). Try again later.",
        { status: res.status },
      ),
      'blocked',
    )
  }
  // A bad key is a 401 with a plain-text body, or a 403 from the API.
  if (res.status === 401 || res.status === 403) {
    throw new PodcastIndexError(
      i18n(
        'Podcast Index rejected the API key and secret (HTTP ${status}). ${description}',
        {
          status: res.status,
          description,
        },
      ).trim(),
      'unauthorized',
    )
  }
  if (!res.ok || json === null) {
    throw new PodcastIndexError(
      i18n('Podcast Index returned an error (HTTP ${status}). ${description}', {
        status: res.status,
        description,
      }).trim(),
      'refused',
    )
  }
  return json
}

export type PodcastIndexFeed = {
  id: number
  title: string
  url: string
  lastCrawlTime: number
  lastParseTime: number
  lastGoodHttpStatusTime: number
  lastHttpStatus: number
  dead: number
  episodeCount: number
  value?: { model?: { type?: string } } | null
}

function asFeed(body: any): PodcastIndexFeed | null {
  const feed = body?.feed
  // A miss comes back as `"feed": []` rather than an error.
  if (!feed || typeof feed !== 'object' || Array.isArray(feed) || !feed.id) {
    return null
  }
  return feed
}

/** Read-only, so it works with the default read-only key. */
export async function getFeedByUrl(
  creds: PodcastIndexCredentials,
  feedUrl: string,
): Promise<PodcastIndexFeed | null> {
  return asFeed(await request('/podcasts/byfeedurl', { url: feedUrl }, creds))
}

export async function getFeedById(
  creds: PodcastIndexCredentials,
  feedId: number,
): Promise<PodcastIndexFeed | null> {
  return asFeed(
    await request('/podcasts/byfeedid', { id: String(feedId) }, creds),
  )
}

/** Any signed call fails with 401 on a wrong key or secret. */
export async function verifyCredentials(
  creds: PodcastIndexCredentials,
): Promise<void> {
  await request('/podcasts/byfeedid', { id: '75075' }, creds)
}

/**
 * Adds a feed, or returns the existing feed ID if Podcast Index already has
 * it. Needs a key with the write permission, which new keys lack.
 */
export async function addFeed(
  creds: PodcastIndexCredentials,
  feedUrl: string,
): Promise<{ feedId: number; existed: boolean }> {
  const body = await request('/add/byfeedurl', { url: feedUrl }, creds, 'POST')
  const feedId = Number(body?.feedId)
  if (String(body?.status) !== 'true' || !feedId) {
    throw new PodcastIndexError(
      i18n('Podcast Index did not add the feed: ${description}', {
        description: String(body?.description ?? 'no reason given'),
      }),
      'refused',
    )
  }
  return { feedId, existed: String(body?.existed) === 'true' }
}

/** Asks Podcast Index to re-read a feed soon. Needs no key; best effort. */
export async function notifyFeedChanged(
  feed: { id: number } | { url: string },
): Promise<void> {
  try {
    await request(
      '/hub/pubnotify',
      'id' in feed ? { id: String(feed.id) } : { url: feed.url },
      null,
    )
  } catch {}
}

export const podcastIndexPage = (feedId: number) =>
  `https://podcastindex.org/podcast/${feedId}`

export const feedUrlFor = (baseUrl: string, handle: string) =>
  `${baseUrl.replace(/\/+$/, '')}/@${handle}/feed.xml`

/**
 * Podcast Index fetches feeds from the internet, so a .onion, .local, LAN or
 * bare-hostname primary URL can never be indexed. Returns why, or null.
 */
export function unreachableReason(baseUrl: string): string | null {
  let host: string
  try {
    host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return baseUrl
  }
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  const privateIpv4 =
    ipv4 &&
    (() => {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
      return (
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      )
    })()
  const privateIpv6 = host.includes(':') && /^(::1$|fc|fd|fe80)/.test(host)
  if (
    host.endsWith('.onion') ||
    host.endsWith('.local') ||
    host === 'localhost' ||
    (!ipv4 && !host.includes(':') && !host.includes('.')) ||
    privateIpv4 ||
    privateIpv6
  ) {
    return host
  }
  return null
}

export type CastopodPodcast = { guid: string; handle: string; title: string }

// A podcast moved elsewhere (new_feed_url) is left out: it is listed and paid
// at its new home. Only published podcasts serve a feed at all.
const listSql = (publishedOnly: boolean) => `
SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('guid', guid, 'handle', handle, 'title', title)), JSON_ARRAY())
FROM ${databasePrefix}podcasts
WHERE (new_feed_url IS NULL OR new_feed_url = '')
${publishedOnly ? 'AND published_at IS NOT NULL AND published_at <= UTC_TIMESTAMP()' : ''}
`

export async function listPodcasts(
  effects: T.Effects,
  databasePassword: string,
  { publishedOnly }: { publishedOnly: boolean },
): Promise<CastopodPodcast[]> {
  let out: string
  try {
    out = await runSql(effects, databasePassword, listSql(publishedOnly))
  } catch (e) {
    throw new Error(
      `${i18n('Could not read the list of podcasts from the database.')} ${String((e as Error)?.message ?? e)}`,
    )
  }
  const podcasts: CastopodPodcast[] = JSON.parse(out.trim())
  return podcasts.sort((a, b) => a.title.localeCompare(b.title))
}

// Podcast Index may store the URL with another scheme or a trailing slash.
const sameUrl = (a: string, b: string) => {
  const norm = (u: string) =>
    u
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
  return norm(a) === norm(b)
}

const formatTime = (unix: number) =>
  new Date(unix * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

/** Status phrases start lowercase so they can follow a podcast title. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type FeedHealth = {
  result: 'success' | 'loading' | 'failure'
  message: string
}

/** What Podcast Index's record says about a feed, for the health check. */
export function describeFeed(
  feed: PodcastIndexFeed | null,
  currentFeedUrl: string,
): FeedHealth {
  if (!feed) {
    return {
      result: 'loading',
      message: i18n('submitted; Podcast Index has not listed it yet'),
    }
  }
  if (feed.dead) {
    return {
      result: 'failure',
      message: i18n(
        'Podcast Index stopped checking the feed after repeated errors. Make sure ${url} opens from the internet, then run Submit to Podcast Index again.',
        { url: currentFeedUrl },
      ),
    }
  }
  if (!sameUrl(feed.url, currentFeedUrl)) {
    return {
      result: 'failure',
      message: i18n(
        'Podcast Index lists the feed at ${indexed}, but Castopod now publishes it at ${current}. Podcast apps keep using the old address.',
        { indexed: feed.url, current: currentFeedUrl },
      ),
    }
  }
  if (!feed.lastCrawlTime) {
    return {
      result: 'loading',
      message: i18n('added; waiting for Podcast Index to read the feed'),
    }
  }
  // 9xx codes are Podcast Index's own crawler states, not HTTP failures.
  if (feed.lastHttpStatus >= 400 && feed.lastHttpStatus < 900) {
    return {
      result: 'failure',
      message: i18n(
        'Podcast Index cannot fetch the feed: it last got HTTP ${status}. Make sure ${url} opens from the internet.',
        { status: feed.lastHttpStatus, url: currentFeedUrl },
      ),
    }
  }
  if (!feed.lastGoodHttpStatusTime || !feed.lastParseTime) {
    return {
      result: 'loading',
      message: i18n('Podcast Index is still reading the feed'),
    }
  }
  const values = {
    count: feed.episodeCount ?? 0,
    time: formatTime(feed.lastCrawlTime),
  }
  return {
    result: 'success',
    message:
      feed.value?.model?.type === 'lightning'
        ? i18n(
            'indexed with ${count} episodes and Lightning payments, last checked ${time}',
            values,
          )
        : i18n('indexed with ${count} episodes, last checked ${time}', values),
  }
}

type HealthCheckResult = T.NamedHealthCheckResultKindInput

const recheckOkMs = 15 * 60_000
const recheckPendingMs = 5 * 60_000
const pollMs = 30_000

/**
 * Runs the check at once, then every 30 s. The default trigger polls a
 * failing check every second; cooldownTrigger waits a full period first.
 */
export const podcastIndexTrigger = async function* () {
  while (true) {
    yield
    await new Promise((r) => setTimeout(r, pollMs))
  }
}

const rank = { success: 0, loading: 1, failure: 2 } as const

/**
 * Health check fn for the podcasts this package submitted. It polls the store
 * every 30 s so a new submission shows up at once, but only calls Podcast
 * Index when the submissions change or the last answer is old enough.
 */
export function podcastIndexHealth(effects: T.Effects, baseUrl: string) {
  let cache: { key: string; at: number; health: HealthCheckResult } | null =
    null

  return async (): Promise<HealthCheckResult> => {
    const pi = await storeJson.read((s) => s.podcastIndex).once()

    // Feeds changed by an action that restarted Castopod: now that it serves
    // again, ask Podcast Index to re-read them. Needs no key.
    const pending = Object.entries(pi?.notify ?? {})
      .filter(([, v]) => v)
      .map(([handle]) => handle)
    if (pending.length) {
      if (!unreachableReason(baseUrl)) {
        await Promise.all(
          pending.map((h) =>
            notifyFeedChanged({ url: feedUrlFor(baseUrl, h) }),
          ),
        )
      }
      await storeJson.merge(effects, {
        podcastIndex: {
          notify: Object.fromEntries(pending.map((h) => [h, false])),
        },
      })
      cache = null
    }

    if (!pi?.apiKey || !pi.apiSecret) {
      return {
        result: 'disabled',
        message: i18n('Not set up. Run Configure Podcast Index to use it.'),
      }
    }
    const submitted = Object.values(pi.submitted)
    if (!submitted.length) {
      return {
        result: 'disabled',
        message: i18n('No podcast submitted yet. Run Submit to Podcast Index.'),
      }
    }

    const key = JSON.stringify([pi.apiKey, submitted])
    if (cache && cache.key === key) {
      const ttl =
        cache.health.result === 'success' ? recheckOkMs : recheckPendingMs
      if (Date.now() - cache.at < ttl) return cache.health
    }

    let health: HealthCheckResult
    try {
      const creds = { apiKey: pi.apiKey, apiSecret: pi.apiSecret }
      const each = await Promise.all(
        submitted.map(async (s) => ({
          title: s.title,
          ...describeFeed(
            await getFeedById(creds, s.feedId),
            feedUrlFor(baseUrl, s.handle),
          ),
        })),
      )
      const worst = each.reduce((a, b) =>
        rank[b.result] > rank[a.result] ? b : a,
      )
      health = {
        result: worst.result,
        message:
          each.length === 1
            ? capitalize(each[0].message)
            : each.map((e) => `${e.title}: ${e.message}`).join(' · '),
      }
    } catch (e) {
      const message = String((e as Error)?.message ?? e)
      if (e instanceof PodcastIndexError && e.kind === 'unauthorized') {
        health = { result: 'failure', message }
      } else if (cache && cache.key === key) {
        // A Podcast Index outage says nothing about the feed: keep the last
        // answer and try again later.
        cache.at = Date.now() - recheckOkMs + recheckPendingMs
        return cache.health
      } else {
        health = { result: 'loading', message }
      }
    }
    cache = { key, at: Date.now(), health }
    return health
  }
}

/**
 * Directories with no submission API: the Submit action links to each one's
 * page for adding a feed by hand. Links are the ones Castopod itself lists
 * (modules/Platforms/Platforms.php).
 */
type Directory = { label: string; url: string; note?: string }

const directoryList = {
  apple: {
    label: 'Apple Podcasts',
    url: 'https://podcastsconnect.apple.com/my-podcasts/new-feed',
  },
  spotify: {
    label: 'Spotify',
    url: 'https://podcasters.spotify.com/dash/submit',
  },
  'youtube-music': {
    label: 'YouTube Music',
    url: 'https://studio.youtube.com/channel/content/podcasts',
  },
  amazon: { label: 'Amazon Music', url: 'https://podcasters.amazon.com/' },
  // Not a submission: Fountain takes shows from Podcast Index by itself.
  // Claiming one gives its owner the dashboard and listener payments.
  fountain: {
    label: i18n('Fountain (claim your show)'),
    url: 'https://fountain.fm/faq/claim-podcast',
    note: i18n(
      'Fountain lists podcasts from Podcast Index by itself, so there is nothing to submit. Claim the show in the Fountain app to manage it and receive listener payments. Fountain verifies you by emailing the owner address in your feed, so the podcast\'s "Remove the owner email from the public RSS feed" setting in Castopod must be off while you claim it.',
    ),
  },
  deezer: {
    label: 'Deezer',
    url: 'https://podcasters.deezer.com/submission',
  },
  pocketcasts: {
    label: 'Pocket Casts',
    url: 'https://www.pocketcasts.com/submit/',
  },
  podcastaddict: {
    label: 'Podcast Addict',
    url: 'https://podcastaddict.com/submit',
  },
  playerfm: { label: 'Player FM', url: 'https://player.fm/importer/feed' },
  castbox: {
    label: 'Castbox',
    url: 'https://helpcenter.castbox.fm/portal/kb/articles/submit-my-podcast',
  },
  listennotes: {
    label: 'Listen Notes',
    url: 'https://www.listennotes.com/submit/',
  },
  podchaser: { label: 'Podchaser', url: 'https://www.podchaser.com/add' },
  fyyd: { label: 'fyyd', url: 'https://fyyd.de/add-feed' },
  blubrry: {
    label: 'Blubrry',
    url: 'https://www.blubrry.com/addpodcast.php',
  },
} satisfies Record<string, Directory>

export type DirectoryId = keyof typeof directoryList
export const directories: Record<DirectoryId, Directory> = directoryList
