import { T } from '@start9labs/start-sdk'
import { storeJson } from './fileModels/store.json'
import {
  filebrowserDescription,
  nextcloudDescription,
  nextexplorerDescription,
} from './manifest/i18n'
import { Provider } from './mediaStorage'
import { sdk } from './sdk'

// A provider is required while media lives there, or a queued move reads from
// or writes to it. Only its volume is used, so it need not be running.
const inUse =
  (provider: Provider) =>
  async ({ effects }: { effects: T.Effects }) =>
    (await storeJson
      .read((s) =>
        [s.mediaStorage, s.mediaMove?.from, s.mediaMove?.to].some(
          (storage) => storage?.location === provider,
        ),
      )
      .const(effects)) ?? false

export const dependencies = sdk.Dependencies.of()
  .addDependency(
    sdk.Dependency.optional('nextexplorer', {
      description: nextexplorerDescription,
      metadata: {
        title: 'NextExplorer',
        icon: 'https://raw.githubusercontent.com/Start9Labs/nextexplorer-startos/04f7ecbfc31ad2205e0222dd7568fb881aa06c79/icon.svg',
      },
      versionRange: '>=2.2.7:0',
      kind: 'exists',
      enabled: inUse('nextexplorer'),
    }),
  )
  .addDependency(
    sdk.Dependency.optional('filebrowser', {
      description: filebrowserDescription,
      metadata: {
        title: 'FileBrowser Quantum',
        icon: 'https://raw.githubusercontent.com/Start9Labs/filebrowser-quantum-startos/e936a6c85a97b930b43cad5e9c0dd4898a2df567/icon.svg',
      },
      versionRange: '>=#quantum:2.0.2-stable:3',
      kind: 'exists',
      enabled: inUse('filebrowser'),
    }),
  )
  .addDependency(
    sdk.Dependency.optional('nextcloud', {
      description: nextcloudDescription,
      metadata: {
        title: 'Nextcloud',
        icon: 'https://raw.githubusercontent.com/Start9Labs/nextcloud-startos/f5025c524301aebe62d9a79ad720223b053e1bf2/icon.svg',
      },
      versionRange: '>=33.0.6:1',
      kind: 'exists',
      enabled: inUse('nextcloud'),
    }),
  )
