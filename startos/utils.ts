import { T, utils } from '@start9labs/start-sdk'
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

/**
 * Runs SQL against Castopod's database from a temporary MariaDB-client
 * subcontainer (the service shares localhost) and returns stdout. Values
 * come back unescaped (`--raw`), one row per line, no column names.
 */
export async function runSql(
  effects: T.Effects,
  databasePassword: string,
  sql: string,
): Promise<string> {
  return sdk.SubContainer.withTemp(
    effects,
    { imageId: 'mariadb' },
    sdk.Mounts.of(),
    'castopod-sql',
    async (sub) => {
      const res = await sub.exec(
        [
          'mariadb',
          '--protocol=tcp',
          '-h',
          '127.0.0.1',
          '-P',
          String(databasePort),
          '-u',
          databaseUser,
          '-D',
          databaseName,
          '--batch',
          '--raw',
          '--skip-column-names',
          '-e',
          sql,
        ],
        { env: { MYSQL_PWD: databasePassword } },
      )
      if (res.exitCode !== 0) {
        // The client warns about MYSQL_PWD on stderr; keep only errors.
        const err = String(res.stderr)
          .split('\n')
          .filter((l) => !l.startsWith('WARNING'))
          .join(' ')
          .trim()
        throw new Error(err)
      }
      return String(res.stdout)
    },
  )
}
