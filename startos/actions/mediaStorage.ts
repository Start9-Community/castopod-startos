import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import {
  describeStorage,
  incompleteMarker,
  internalStorage,
  isNextcloudFilesPath,
  isRelativePath,
  listProviderFolder,
  MediaStorage,
  parentOf,
  providerTitles,
  sameStorage,
} from '../mediaStorage'
import { sdk } from '../sdk'

const { InputSpec, Value, Variants } = sdk

const relativePattern = {
  regex: '^(?!/)(?!(.*/)?\\.\\.(/|$))[^/].*[^/]$|^[^/]$',
  description: i18n(
    'Must be a relative path, such as Castopod, with no leading or trailing / and no .. segments',
  ),
}

const folderSpec = (description: string, placeholder: string, extra = []) =>
  InputSpec.of({
    subfolder: Value.text({
      name: i18n('Folder'),
      description,
      required: true,
      default: placeholder,
      placeholder,
      patterns: [relativePattern, ...extra],
    }),
  })

export const inputSpec = InputSpec.of({
  storage: Value.union({
    name: i18n('Media Location'),
    description: i18n(
      'Where Castopod keeps all its media: episode audio, artwork, transcripts and video clips.',
    ),
    default: 'internal',
    variants: Variants.of({
      internal: { name: i18n('Internal storage'), spec: InputSpec.of({}) },
      nextexplorer: {
        name: providerTitles.nextexplorer,
        spec: folderSpec(
          i18n(
            'A new or empty folder, starting with its location. A top-level folder, such as Castopod, becomes its own location in NextExplorer; Files/Castopod is a folder inside the Files location.',
          ),
          'Castopod',
        ),
      },
      filebrowser: {
        name: providerTitles.filebrowser,
        spec: folderSpec(
          i18n(
            'A new or empty folder, such as Castopod. Its parent folder must already exist.',
          ),
          'Castopod',
        ),
      },
      nextcloud: {
        name: providerTitles.nextcloud,
        spec: InputSpec.of({
          subfolder: Value.text({
            name: i18n('Folder'),
            description: i18n(
              'A new or empty folder inside a Nextcloud account: data/<account>/files/<folder>, such as data/admin/files/Castopod for the account named admin.',
            ),
            required: true,
            default: 'data/admin/files/Castopod',
            placeholder: 'data/admin/files/Castopod',
            patterns: [
              relativePattern,
              {
                regex: '^data/[^/]+/files/[^/].*$',
                description: i18n(
                  "Must be inside a Nextcloud account's files, such as data/admin/files/Castopod",
                ),
              },
            ],
          }),
        }),
      },
    }),
  }),
})

const toStorage = (input: typeof inputSpec._TYPE): MediaStorage =>
  input.storage.selection === 'internal'
    ? internalStorage
    : {
        location: input.storage.selection,
        subfolder: input.storage.value.subfolder.trim(),
      }

const result = (title: string, message: string) => ({
  version: '1' as const,
  title,
  message,
  result: null,
})

export const mediaStorage = sdk.Action.withInput(
  'media-storage',

  async ({ effects }) => ({
    name: i18n('Media Storage'),
    description: i18n(
      'Choose where Castopod keeps its media: its own storage, or a folder in NextExplorer, FileBrowser Quantum or Nextcloud. Existing media is copied to the new location when Castopod next starts.',
    ),
    warning: i18n(
      'Back up first. The new location needs room for a full copy of your media, and Castopod is unavailable while it copies. The old copy is kept. Media kept in another service is backed up by that service, not by Castopod.',
    ),
    allowedStatuses: 'any',
    group: i18n('Media'),
    visibility: 'enabled',
  }),

  inputSpec,

  async ({ effects }) => {
    const store = await storeJson.read().once()
    const s = store?.mediaMove?.to ?? store?.mediaStorage ?? internalStorage
    return {
      storage:
        s.location === 'internal'
          ? { selection: 'internal' as const, value: {} }
          : { selection: s.location, value: { subfolder: s.subfolder } },
    }
  },

  async ({ effects, input }) => {
    const store = await storeJson.read().once()
    if (!store) throw new Error('Store not found')
    const target = toStorage(input)
    const active = store.mediaStorage

    if (target.location !== 'internal') {
      if (!isRelativePath(target.subfolder)) {
        throw new Error(
          i18n(
            'Must be a relative path, such as Castopod, with no leading or trailing / and no .. segments',
          ),
        )
      }
      if (
        target.location === 'nextcloud' &&
        !isNextcloudFilesPath(target.subfolder)
      ) {
        throw new Error(
          i18n(
            "Must be inside a Nextcloud account's files, such as data/admin/files/Castopod",
          ),
        )
      }
    }

    if (sameStorage(target, active)) {
      if (!store.mediaMove) {
        return result(
          i18n('Media Storage'),
          i18n('Castopod already keeps its media in ${location}.', {
            location: describeStorage(active),
          }),
        )
      }
      await storeJson.merge(effects, { mediaMove: null })
      return result(
        i18n('Media Storage'),
        i18n('The pending move was cancelled. Media stays in ${location}.', {
          location: describeStorage(active),
        }),
      )
    }

    // Where the media is now must be readable to copy from.
    const activeReachable =
      active.location === 'internal' ||
      (await listProviderFolder(effects, active.location, active.subfolder)) !==
        null
    if (!activeReachable) {
      if (target.location !== 'internal') {
        throw new Error(
          i18n(
            'The current media folder in ${location} cannot be reached, so its media cannot be copied. Restore it, or choose internal storage to fall back to the copy kept there.',
            { location: describeStorage(active) },
          ),
        )
      }
      // Recovery: fall back to whatever Castopod kept internally.
      await storeJson.merge(effects, {
        mediaStorage: internalStorage,
        mediaMove: null,
      })
      return result(
        i18n('Media Storage'),
        i18n(
          'The current media folder cannot be reached, so nothing was copied. Castopod now uses the media kept in its internal storage, which may be missing anything uploaded since media was moved out of it.',
        ),
      )
    }

    if (target.location !== 'internal') {
      if (
        active.location === target.location &&
        (target.subfolder.startsWith(`${active.subfolder}/`) ||
          active.subfolder.startsWith(`${target.subfolder}/`))
      ) {
        throw new Error(
          i18n(
            'The new folder cannot be inside the current media folder, or contain it.',
          ),
        )
      }
      const parent = parentOf(target.subfolder)
      if (
        (await listProviderFolder(effects, target.location, parent)) === null
      ) {
        throw new Error(
          parent
            ? i18n(
                'The folder "${parent}" was not found in ${library}. Check the path, and that ${library} is installed.',
                { parent, library: providerTitles[target.location] },
              )
            : i18n('${library} is not installed.', {
                library: providerTitles[target.location],
              }),
        )
      }
      const existing = await listProviderFolder(
        effects,
        target.location,
        target.subfolder,
      )
      if (existing && existing.some((name) => name !== incompleteMarker)) {
        throw new Error(
          i18n(
            'The folder "${subfolder}" in ${library} is not empty. Choose a new or empty folder.',
            {
              subfolder: target.subfolder,
              library: providerTitles[target.location],
            },
          ),
        )
      }
    }

    await storeJson.merge(effects, {
      mediaMove: { from: active, to: target, error: null },
    })
    return result(
      i18n('Media Storage'),
      i18n(
        'Media will be copied to ${location} before Castopod starts again; a running Castopod restarts now to do it. Watch the logs for progress. The copy in ${previous} is kept.',
        {
          location: describeStorage(target),
          previous: describeStorage(active),
        },
      ),
    )
  },
)
