import { utils } from '@start9labs/start-sdk'
import { sdk } from './sdk'

// FrankenPHP/Caddy listens here inside the image (CADDY_HTTP_PORT).
export const uiPort = 8080
export const mainHostId = 'main'
export const uiInterfaceId = 'ui'
export const adminInterfaceId = 'admin'
// Castopod's admin gateway (upstream default, CP_ADMIN_GATEWAY unset)
export const adminPath = '/cp-admin'

export const databasePort = 3306
export const databaseName = 'castopod'
export const databaseUser = 'castopod'
export const databasePrefix = 'cp_'

// The owner account the package creates. Castopod signs in by email, not username.
export const adminUsername = 'admin'
// Placeholder until the user sets a real address with the Set Owner Email action.
export const defaultAdminEmail = 'admin@castopod.local'

// Alphanumeric only: upstream's bootstrap writes these into /app/.env inside
// double quotes, so quotes, `$` and backslashes would corrupt it.
export const randomSecret = (len: number) =>
  utils.getDefaultString({ charset: 'a-z,A-Z,0-9', len })

// CodeIgniter reads `database.default.*` from real environment variables
// (dots as underscores), so CLI calls work without the .env the image's
// bootstrap writes.
export const cliDatabaseEnv = (password: string) => ({
  database_default_hostname: '127.0.0.1',
  database_default_port: String(databasePort),
  database_default_database: databaseName,
  database_default_username: databaseUser,
  database_default_password: password,
  database_default_DBPrefix: databasePrefix,
})
