import { primaryUrl } from '../primaryUrl'
import { sdk } from '../sdk'
import { configurePodcastIndex } from './configurePodcastIndex'
import { configureSmtp } from './configureSmtp'
import { deleteInternalMedia } from './deleteInternalMedia'
import { mediaStorage } from './mediaStorage'
import { setAdminPassword } from './setAdminPassword'
import { setLightningAddress } from './setLightningAddress'
import { setOwnerEmail } from './setOwnerEmail'
import { submitPodcastIndex } from './submitPodcastIndex'
import { toggle2fa } from './toggle2fa'

export const actions = sdk.Actions.of()
  .addAction(setAdminPassword)
  .addAction(setOwnerEmail)
  .addAction(primaryUrl.action)
  .addAction(configureSmtp)
  .addAction(toggle2fa)
  .addAction(mediaStorage)
  .addAction(deleteInternalMedia)
  .addAction(configurePodcastIndex)
  .addAction(submitPodcastIndex)
  .addAction(setLightningAddress)
