import { setupManifest } from '@start9labs/start-sdk'
import { long, short } from './i18n'

export const manifest = setupManifest({
  id: 'castopod',
  title: 'Castopod',
  license: 'AGPL-3.0',
  packageRepo: 'https://github.com/The-Cryptosquid/castopod-startos',
  upstreamRepo: 'https://code.castopod.org/adaures/castopod',
  marketingUrl: 'https://castopod.org/',
  donationUrl: 'https://opencollective.com/castopod',
  description: { short, long },
  volumes: ['main', 'database'],
  images: {
    castopod: {
      source: { dockerTag: 'castopod/castopod:1.15.6' },
      arch: ['x86_64', 'aarch64'],
    },
    mariadb: {
      source: { dockerTag: 'mariadb:11.8.9' },
      arch: ['x86_64', 'aarch64'],
    },
  },
})
