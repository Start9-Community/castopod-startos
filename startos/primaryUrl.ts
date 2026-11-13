import { storeJson } from './fileModels/store.json'
import { i18n } from './i18n'
import { sdk } from './sdk'
import { mainHostId, uiInterfaceId } from './utils'

export const primaryUrl = sdk.setupPrimaryUrl({
  id: 'set-primary-url',
  hostId: mainHostId,
  interfaceId: uiInterfaceId,
  metadata: {
    name: i18n('Set Primary URL'),
    description: i18n(
      'Choose the address Castopod builds its links from: RSS feed and media URLs, episode pages, embeds and fediverse identities.',
    ),
    warning: i18n(
      'Podcast apps and directories keep the feed and media URLs they were given. Changing this after publishing a podcast breaks those links.',
    ),
    allowedStatuses: 'any',
    group: i18n('Settings'),
    visibility: 'enabled',
  },
  field: { name: i18n('URL'), description: null },
  get: storeJson.read((s) => s.primaryUrl),
  set: (effects, url) => storeJson.merge(effects, { primaryUrl: url }),
})
