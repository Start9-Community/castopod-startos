import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.15.6:1',
  releaseNotes: {
    en_US:
      'Initial release of Castopod for StartOS. [Castopod 1.15.6 release notes](https://code.castopod.org/adaures/castopod/-/releases/v1.15.6)',
    es_ES:
      'Versión inicial de Castopod para StartOS. [Notas de la versión 1.15.6 de Castopod](https://code.castopod.org/adaures/castopod/-/releases/v1.15.6)',
    de_DE:
      'Erstveröffentlichung von Castopod für StartOS. [Versionshinweise zu Castopod 1.15.6](https://code.castopod.org/adaures/castopod/-/releases/v1.15.6)',
    pl_PL:
      'Pierwsze wydanie Castopod dla StartOS. [Informacje o wydaniu Castopod 1.15.6](https://code.castopod.org/adaures/castopod/-/releases/v1.15.6)',
    fr_FR:
      'Version initiale de Castopod pour StartOS. [Notes de version de Castopod 1.15.6](https://code.castopod.org/adaures/castopod/-/releases/v1.15.6)',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
