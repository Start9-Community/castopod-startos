import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.15.6:0',
  releaseNotes: {
    en_US: 'Initial release of Castopod 1.15.6 for StartOS',
    es_ES: 'Lanzamiento inicial de Castopod 1.15.6 para StartOS',
    de_DE: 'Erstveröffentlichung von Castopod 1.15.6 für StartOS',
    pl_PL: 'Pierwsze wydanie Castopod 1.15.6 dla StartOS',
    fr_FR: 'Version initiale de Castopod 1.15.6 pour StartOS',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
