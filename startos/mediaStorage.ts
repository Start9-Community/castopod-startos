import { T, z } from '@start9labs/start-sdk'
import { i18n } from './i18n'
import { sdk } from './sdk'

/**
 * Where Castopod's media folder (/var/www/html/public/media) lives: the package's own
 * `main` volume, or a folder inside NextExplorer, FileBrowser Quantum or
 * Nextcloud. External storage is mounted read-write, so uploads land there.
 */

export const providers = ['nextexplorer', 'filebrowser', 'nextcloud'] as const
export type Provider = (typeof providers)[number]

export const storageShape = z.discriminatedUnion('location', [
  z.looseObject({ location: z.literal('internal') }),
  z.looseObject({ location: z.enum(providers), subfolder: z.string() }),
])
export type MediaStorage = z.infer<typeof storageShape>

export const internalStorage: MediaStorage = { location: 'internal' }

// A queued copy, run before Castopod starts. `error` is set when it failed, so
// it is reported on each start instead of being retried in a loop.
export const moveShape = z.looseObject({
  from: storageShape,
  to: storageShape,
  error: z.string().nullable(),
})
export type MediaMove = z.infer<typeof moveShape>

// The real path. The image's /app is a symlink to /var/www/html, and StartOS
// creates mountpoints without following symlinks: mounting at /app/... fails
// with ENOTDIR.
export const mediaPath = '/var/www/html/public/media'
// Castopod's own media folder on the `main` volume.
export const internalSubpath = 'media'

export const providerTitles: Record<Provider, string> = {
  nextexplorer: 'NextExplorer',
  filebrowser: 'FileBrowser Quantum',
  nextcloud: 'Nextcloud',
}

// Local contracts for the providers' manifests: only their id and the volume
// mounted here. Their packages are not build dependencies.
type ProviderManifest<Id extends Provider, Volume extends string> = Omit<
  T.SDKManifest,
  'id' | 'volumes'
> & { id: Id; volumes: [Volume] }
type NextExplorerManifest = ProviderManifest<'nextexplorer', 'data'>
type FileBrowserManifest = ProviderManifest<'filebrowser', 'data'>
type NextcloudManifest = ProviderManifest<'nextcloud', 'nextcloud'>

// Castopod runs as www-data (33). NextExplorer and FileBrowser Quantum own
// their files as uid 1000, so their storage is idmapped 1000 -> 33, the same
// mapping Nextcloud uses when it mounts them. Nextcloud's files are already
// owned by www-data (33). In an idmapped mount, only mapped ids can create
// files, so writes there are made as www-data, never as root.
const providerIdmap = { idmap: [{ fromId: 1000, toId: 33 }] }

export const isNextcloudFilesPath = (subfolder: string) =>
  /^data\/[^/]+\/files\/[^/].*$/.test(subfolder)

export const isRelativePath = (subfolder: string) =>
  /^(?!\/)(?!(.*\/)?\.\.(\/|$))[^\0]+$/.test(subfolder) &&
  !subfolder.endsWith('/')

export const parentOf = (subfolder: string) => {
  const i = subfolder.lastIndexOf('/')
  return i === -1 ? null : subfolder.slice(0, i)
}

export const baseName = (subfolder: string) =>
  subfolder.slice(subfolder.lastIndexOf('/') + 1)

/** Mount a provider's storage, `subpath` relative to its volume root. */
export function mountProvider(
  mounts: ReturnType<typeof sdk.Mounts.of>,
  provider: Provider,
  subpath: string | null,
  mountpoint: string,
  readonly: boolean,
) {
  switch (provider) {
    case 'nextexplorer':
      return mounts.mountDependency<NextExplorerManifest>({
        dependencyId: 'nextexplorer',
        volumeId: 'data',
        subpath,
        mountpoint,
        readonly,
        ...providerIdmap,
      })
    case 'filebrowser':
      return mounts.mountDependency<FileBrowserManifest>({
        dependencyId: 'filebrowser',
        volumeId: 'data',
        subpath,
        mountpoint,
        readonly,
        ...providerIdmap,
      })
    case 'nextcloud':
      return mounts.mountDependency<NextcloudManifest>({
        dependencyId: 'nextcloud',
        volumeId: 'nextcloud',
        subpath,
        mountpoint,
        readonly,
      })
  }
}

/** The media folder mount for the Castopod daemon. */
export function mediaMounts(storage: MediaStorage) {
  const mounts = sdk.Mounts.of()
  return storage.location === 'internal'
    ? mounts.mountVolume({
        volumeId: 'main',
        subpath: internalSubpath,
        mountpoint: mediaPath,
        readonly: false,
      })
    : mountProvider(
        mounts,
        storage.location,
        storage.subfolder,
        mediaPath,
        false,
      )
}

export const describeStorage = (storage: MediaStorage) =>
  storage.location === 'internal'
    ? i18n('Internal storage')
    : `${providerTitles[storage.location]}: ${storage.subfolder}`

/**
 * Lists a provider folder through a read-only mount. A read-only mount of a
 * missing folder fails (a read-write one would create it), so `null` means the
 * folder, or the whole provider, is not there.
 */
export async function listProviderFolder(
  effects: T.Effects,
  provider: Provider,
  subpath: string | null,
): Promise<string[] | null> {
  try {
    return await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'castopod' },
      mountProvider(sdk.Mounts.of(), provider, subpath, '/check', true),
      'check-media-storage',
      async (sub) => {
        const res = await sub.execFail(['ls', '-A', '/check'])
        return String(res.stdout)
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      },
    )
  } catch (e) {
    console.warn(e)
    return null
  }
}

export const sameStorage = (a: MediaStorage, b: MediaStorage) =>
  a.location === b.location &&
  (a.location === 'internal' ||
    (b.location !== 'internal' && a.subfolder === b.subfolder))

export const incompleteMarker = '.castopod-copy-incomplete'

// Copies the current media into the destination folder, which the script
// creates inside its (existing) parent. A destination left half-copied by an
// interrupted run carries the marker and is cleared and copied again.
const copyScript = `
set -eu
D="/dst-parent/$DST_NAME"
mkdir -p "$D"
if [ "$CLEAR_DST" = 1 ] || [ -e "$D/${incompleteMarker}" ]; then
  find "$D" -mindepth 1 -delete
fi
if [ -n "$(ls -A "$D")" ]; then
  echo "The destination folder is not empty" >&2
  exit 1
fi
touch "$D/${incompleteMarker}"
files=$(find /src -type f | wc -l)
size=$(du -sh /src | cut -f1)
echo "Copying $files media files ($size)"
cp -R --preserve=timestamps /src/. "$D/"
if [ "$(id -u)" = 0 ]; then chown -R www-data:www-data "$D"; fi
rm -f "$D/${incompleteMarker}"
sync
echo "Copied $files media files"
`

/** Runs a queued move: copies the media, then makes the destination active. */
export async function copyMedia(effects: T.Effects, move: MediaMove) {
  const { from, to } = move

  let mounts =
    from.location === 'internal'
      ? sdk.Mounts.of().mountVolume({
          volumeId: 'main',
          subpath: internalSubpath,
          mountpoint: '/src',
          // read-write so a media folder that was never created is
          // created (empty) instead of failing the mount
          readonly: false,
        })
      : mountProvider(
          sdk.Mounts.of(),
          from.location,
          from.subfolder,
          '/src',
          true,
        )

  mounts =
    to.location === 'internal'
      ? mounts.mountVolume({
          volumeId: 'main',
          subpath: null,
          mountpoint: '/dst-parent',
          readonly: false,
        })
      : mountProvider(
          mounts,
          to.location,
          parentOf(to.subfolder),
          '/dst-parent',
          false,
        )

  const env = {
    DST_NAME:
      to.location === 'internal' ? internalSubpath : baseName(to.subfolder),
    // Castopod's internal folder only holds a copy kept from before an
    // earlier move; the source is current, so it is replaced.
    CLEAR_DST: to.location === 'internal' ? '1' : '0',
  }

  await sdk.SubContainer.withTemp(
    effects,
    { imageId: 'castopod' },
    mounts,
    'media-copy',
    async (sub) => {
      const res = await sub.exec(['sh', '-c', copyScript], {
        // Internal storage is root-owned until chowned; external storage is
        // idmapped, where only www-data can create files.
        user: to.location === 'internal' ? 'root' : 'www-data',
        env,
      })
      const out = String(res.stdout).trim()
      if (out) console.info(out)
      if (res.exitCode !== 0) {
        throw new Error(
          String(res.stderr).trim() || `exit code ${res.exitCode}`,
        )
      }
    },
  )
}
