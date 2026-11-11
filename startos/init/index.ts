import { actions } from '../actions'
import { restoreInit } from '../backups'
import { dependencies } from '../dependencies'
import { setInterfaces } from '../interfaces'
import { sdk } from '../sdk'
import { versionGraph } from '../versions'
import { primaryUrlTask } from './primaryUrlTask'
import { seedStore } from './seedStore'
import { watchCredentials } from './watchCredentials'

export const init = sdk.setupInit(
  restoreInit,
  versionGraph,
  seedStore,
  setInterfaces,
  actions,
  dependencies,
  watchCredentials,
  primaryUrlTask,
)

export const uninit = sdk.setupUninit(versionGraph)
