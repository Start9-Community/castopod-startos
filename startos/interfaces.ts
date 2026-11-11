import { i18n } from './i18n'
import { primaryUrl } from './primaryUrl'
import { sdk } from './sdk'
import {
  adminInterfaceId,
  adminPath,
  mainHostId,
  uiInterfaceId,
  uiPort,
} from './utils'

// Castopod serves both on one port: the public podcast website and feeds at /,
// and the admin area under /cp-admin. They are separate interfaces because they
// are for different audiences — listeners and podcast apps open one, the
// podcaster manages the instance from the other.
export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const multi = sdk.MultiHost.of(effects, mainHostId)
  const origin = await multi.bindPort(uiPort, { protocol: 'http' })

  // Castopod builds every link, and its post-login redirect, from the primary
  // URL, so both interfaces open on it. The match is on scheme, host and port;
  // each interface's own path is added on top.
  const preferredLauncherAddress = await primaryUrl.bestUsable(effects).const()

  const ui = sdk.createInterface(effects, {
    name: i18n('Podcast Website'),
    id: uiInterfaceId,
    description: i18n(
      'Your public podcast website, RSS feeds and media, for listeners and podcast apps',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
    preferredLauncherAddress,
  })

  const admin = sdk.createInterface(effects, {
    name: i18n('Admin Area'),
    id: adminInterfaceId,
    description: i18n(
      'Where you manage Castopod: podcasts, episodes, uploads, users and settings',
    ),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: adminPath,
    query: {},
    preferredLauncherAddress,
  })

  return [await origin.export([ui, admin])]
})
