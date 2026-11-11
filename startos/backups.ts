import { storeJson } from './fileModels/store.json'
import { sdk } from './sdk'
import { databaseName, databaseUser } from './utils'

export const { createBackup, restoreInit } = sdk.setupBackups(async () =>
  sdk.Backups.withMariadbDump({
    imageId: 'mariadb',
    dbVolume: 'database',
    datadir: '/var/lib/mysql',
    database: databaseName,
    user: databaseUser,
    password: async () => {
      const password = await storeJson.read((s) => s.databasePassword).once()
      if (!password) throw new Error('Castopod database password is missing')
      return password
    },
    readyTimeout: 120000,
  }).addVolume('main'),
)
