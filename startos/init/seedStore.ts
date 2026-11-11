import { storeJson } from '../fileModels/store.json'
import { sdk } from '../sdk'
import { randomSecret } from '../utils'

// Secrets are minted once and kept: the database password lives in the
// database volume, and changing the analytics salt splits every listener's
// download statistics in two.
export const seedStore = sdk.setupOnInit(async (effects) => {
  const store = await storeJson.read().once()
  await storeJson.merge(effects, {
    databasePassword: store?.databasePassword ?? randomSecret(32),
    analyticsSalt: store?.analyticsSalt ?? randomSecret(64),
  })
})
