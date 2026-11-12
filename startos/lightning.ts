import { T } from '@start9labs/start-sdk'
import { i18n } from './i18n'
import { databasePrefix, runSql } from './utils'

// Value-for-value payments: a Podcasting 2.0 <podcast:value> block in the
// feed tells listener apps where to send Lightning payments.
// https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/tags/value.md
//
// Castopod has no Lightning field of its own (its payment pointer is Web
// Monetization), so the block goes into the podcast's "Custom RSS tags",
// which Castopod injects into the feed's <channel>.

const podcastNs = 'https://podcastindex.org/namespace/1.0'
const lookupTimeoutMs = 15_000

export type ValueRecipient =
  | {
      kind: 'keysend'
      address: string
      pubkey: string
      customKey: string | null
      customValue: string | null
    }
  | { kind: 'lnaddress'; address: string }

/** Lowercased `name@domain`, or null if it is not a Lightning address. */
export function parseLightningAddress(
  input: string,
): { address: string; user: string; domain: string } | null {
  const address = input.trim().toLowerCase()
  const m = address.match(/^([a-z0-9._+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/)
  return m ? { address, user: m[1], domain: m[2] } : null
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(lookupTimeoutMs),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Resolves a Lightning address the way the namespace's lnaddress page
 * describes: keysend details from /.well-known/keysend/<user>, which every
 * value-for-value app can pay. A wallet without that endpoint but with
 * LNURL-pay (/.well-known/lnurlp/<user>) can only be written as an
 * lnaddress recipient, which fewer apps support.
 */
export async function resolveLightningAddress(
  input: string,
): Promise<ValueRecipient> {
  const parsed = parseLightningAddress(input)
  if (!parsed) {
    throw new Error(
      i18n(
        '"${address}" is not a Lightning address. It looks like name@wallet.com.',
        {
          address: input.trim(),
        },
      ),
    )
  }
  const { address, user, domain } = parsed
  const base = `https://${domain}/.well-known`

  const keysend = await getJson(`${base}/keysend/${encodeURIComponent(user)}`)
  const pubkey = String(keysend?.pubkey ?? '')
  if (
    keysend &&
    String(keysend.status ?? 'OK').toUpperCase() === 'OK' &&
    /^0[23][0-9a-f]{64}$/i.test(pubkey)
  ) {
    const custom = Array.isArray(keysend.customData)
      ? keysend.customData.find((c: any) => c?.customKey && c?.customValue)
      : null
    return {
      kind: 'keysend',
      address,
      pubkey: pubkey.toLowerCase(),
      customKey: custom ? String(custom.customKey) : null,
      customValue: custom ? String(custom.customValue) : null,
    }
  }

  const lnurlp = await getJson(`${base}/lnurlp/${encodeURIComponent(user)}`)
  if (lnurlp?.tag === 'payRequest' && lnurlp.callback) {
    return { kind: 'lnaddress', address }
  }

  throw new Error(
    i18n(
      '${domain} did not answer for ${address}: it serves neither keysend nor LNURL-pay details for it. Check the address, and that the wallet supports receiving to a Lightning address.',
      { domain, address },
    ),
  )
}

// Castopod stores custom tags as JSON in its own shape (rss_to_array in
// app/Helpers/rss_helper.php): { name, namespace, attributes?, content?,
// elements? }, with namespace an object of prefix → URI, or [] for none.
type RssNode = {
  name: string
  namespace: Record<string, string> | []
  attributes?: Record<string, string>
  content?: string
  elements?: RssNode[]
}

const isLightningValue = (n: RssNode) =>
  n.name === 'value' &&
  !Array.isArray(n.namespace) &&
  Object.values(n.namespace).includes(podcastNs) &&
  n.attributes?.type === 'lightning'

export function valueNode(recipient: ValueRecipient): RssNode {
  const ns = { podcast: podcastNs }
  const attributes: Record<string, string> =
    recipient.kind === 'keysend'
      ? {
          name: recipient.address,
          type: 'node',
          address: recipient.pubkey,
          split: '100',
          ...(recipient.customKey && recipient.customValue
            ? {
                customKey: recipient.customKey,
                customValue: recipient.customValue,
              }
            : {}),
        }
      : {
          name: recipient.address,
          type: 'lnaddress',
          address: recipient.address,
          split: '100',
        }
  return {
    name: 'value',
    namespace: ns,
    attributes: {
      type: 'lightning',
      method: recipient.kind === 'keysend' ? 'keysend' : 'lnaddress',
    },
    elements: [{ name: 'valueRecipient', namespace: ns, attributes }],
  }
}

/** The XML Castopod will put in the feed, for showing to the user. */
export function valueXml(recipient: ValueRecipient): string {
  const node = valueNode(recipient)
  const escape = (v: string) =>
    v
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const attrs = (a: Record<string, string> = {}) =>
    Object.entries(a)
      .map(([k, v]) => ` ${k}="${escape(v)}"`)
      .join('')
  const child = node.elements![0]
  return `<podcast:value${attrs(node.attributes)}>\n  <podcast:valueRecipient${attrs(child.attributes)}/>\n</podcast:value>`
}

const guidPattern = /^[0-9a-f-]{36}$/i
const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex')

async function readCustomRss(
  effects: T.Effects,
  databasePassword: string,
  guid: string,
): Promise<RssNode[]> {
  const out = (
    await runSql(
      effects,
      databasePassword,
      `SELECT COALESCE(custom_rss, '[]') FROM ${databasePrefix}podcasts WHERE guid = '${guid}'`,
    )
  ).trim()
  if (!out) throw new Error(i18n('That podcast no longer exists in Castopod.'))
  const parsed = JSON.parse(out)
  if (!Array.isArray(parsed)) {
    throw new Error(i18n("The podcast's custom RSS tags could not be read."))
  }
  return parsed
}

/**
 * Replaces the podcast's Lightning value block (or removes it, given null),
 * keeping every other custom tag. Returns whether a block was there before.
 * Castopod only sees the change in a fresh feed cache, i.e. after a restart.
 */
export async function setLightningValue(
  effects: T.Effects,
  databasePassword: string,
  guid: string,
  recipient: ValueRecipient | null,
): Promise<{ hadValue: boolean }> {
  if (!guidPattern.test(guid)) throw new Error(`Invalid podcast guid: ${guid}`)

  const current = await readCustomRss(effects, databasePassword, guid)
  const others = current.filter((n) => !isLightningValue(n))
  const next = recipient ? [...others, valueNode(recipient)] : others

  // Hex-encoded so no quoting of user-supplied text reaches the SQL.
  const value = next.length
    ? `CONVERT(UNHEX('${hex(JSON.stringify(next))}') USING utf8mb4)`
    : 'NULL'
  await runSql(
    effects,
    databasePassword,
    `UPDATE ${databasePrefix}podcasts SET custom_rss = ${value} WHERE guid = '${guid}'`,
  )
  return { hadValue: others.length !== current.length }
}
