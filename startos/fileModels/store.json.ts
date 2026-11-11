import { FileHelper, smtpShape, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { moveShape, storageShape } from '../mediaStorage'
import { defaultAdminEmail } from '../utils'

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
})

export const storeJson = FileHelper.json(
  { base: sdk.volumes.main, subpath: './store.json' },
  shape,
)
