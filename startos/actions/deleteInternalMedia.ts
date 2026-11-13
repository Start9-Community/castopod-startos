import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { describeStorage, internalSubpath } from '../mediaStorage'
import { sdk } from '../sdk'

// After media moves to another service, the internal copy stays behind as a
// fallback. It is part of Castopod's backups until it is deleted.
export const deleteInternalMedia = sdk.Action.withoutInput(
  'delete-internal-media',

  async ({ effects }) => {
    const store = await storeJson.read().const(effects)
    const external = store?.mediaStorage.location !== 'internal'
    const moving = !!store?.mediaMove
    return {
      name: i18n('Delete Internal Media Copy'),
      description: i18n(
        "Delete the copy of Castopod's media kept in its internal storage after media was moved to another service. Frees space and shrinks Castopod's backups.",
      ),
      warning: i18n(
        'The internal copy is your fallback if the other service or its folder is lost. Make sure that service is backed up first. This cannot be undone.',
      ),
      allowedStatuses: 'any',
      group: i18n('Media'),
      visibility: !external
        ? {
            disabled: i18n(
              'Castopod keeps its media in internal storage, so this is the live copy.',
            ),
          }
        : moving
          ? {
              disabled: i18n(
                'A media move is pending. Let it finish or cancel it first.',
              ),
            }
          : 'enabled',
    }
  },

  async ({ effects }) => {
    const store = await storeJson.read().once()
    if (
      !store ||
      store.mediaStorage.location === 'internal' ||
      store.mediaMove
    ) {
      throw new Error(
        i18n(
          'Castopod keeps its media in internal storage, so this is the live copy.',
        ),
      )
    }
    await sdk.SubContainer.withTemp(
      effects,
      { imageId: 'castopod' },
      sdk.Mounts.of().mountVolume({
        volumeId: 'main',
        subpath: internalSubpath,
        mountpoint: '/old-media',
        readonly: false,
      }),
      'delete-internal-media',
      async (sub) => {
        await sub.execFail(
          ['find', '/old-media', '-mindepth', '1', '-delete'],
          {
            user: 'root',
          },
        )
      },
    )
    return {
      version: '1',
      title: i18n('Delete Internal Media Copy'),
      message: i18n(
        'The internal copy was deleted. Castopod keeps using its media in ${location}.',
        { location: describeStorage(store.mediaStorage) },
      ),
      result: null,
    }
  },
)
