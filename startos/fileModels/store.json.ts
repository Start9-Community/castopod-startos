import { FileHelper, smtpShape, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { moveShape, storageShape } from '../mediaStorage'
import { defaultAdminEmail } from '../utils'

// Feeds added to Podcast Index, keyed by Castopod podcast guid. A record, not
// an array: merge unions arrays, so a re-submission could never replace one.
const submissionShape = z.looseObject({
  handle: z.string(),
  title: z.string(),
  feedId: z.number(),
})

const podcastIndexShape = z.looseObject({
  apiKey: z.string().nullable().catch(null),
  apiSecret: z.string().nullable().catch(null),
  submitted: z.record(z.string(), submissionShape).catch(() => ({})),
  // Podcast handles whose feed changed while Castopod restarted; the health
  // check pings Podcast Index for them once Castopod is back, then sets false.
  notify: z.record(z.string(), z.boolean()).catch(() => ({})),
})

const shape = z.looseObject({
  databasePassword: z.string().optional().catch(undefined),
  analyticsSalt: z.string().optional().catch(undefined),
  adminPassword: z.string().optional().catch(undefined),
  adminEmail: z.string().catch(defaultAdminEmail),
  primaryUrl: z.string().optional().catch(undefined),
  enable2fa: z.boolean().catch(false),
  smtp: smtpShape.catch({ selection: 'disabled', value: {} }),
  // merge mutates what it parses, so each fallback must be a fresh object
  mediaStorage: storageShape.catch(() => ({ location: 'internal' as const })),
  mediaMove: moveShape.nullable().catch(null),
  // Bumped by set-lightning-address. Main reads it, so a change restarts
  // Castopod, whose feed cache lives in the container and starts empty.
  feedRevision: z.number().catch(0),
  podcastIndex: podcastIndexShape.catch(() => ({
    apiKey: null,
    apiSecret: null,
    submitted: {},
    notify: {},
  })),
})

export const storeJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: './store.json' },
  shape,
)
