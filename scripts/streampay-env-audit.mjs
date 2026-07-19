import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const renderYaml = await readFile(resolve(root, 'render.yaml'), 'utf8')
const envFiles = ['.env.local', '.env'].filter(file => existsSync(resolve(root, file)))
const envFileText = (await Promise.all(envFiles.map(file => readFile(resolve(root, file), 'utf8')))).join('\n')

const required = [
  'DATABASE_URL',
  'HASH_PAYLINK_BASE_URL',
  'PUBLIC_APP_URL',
  'CREATOR_ADMIN_KEY',
  'CREATOR_OFFICIAL_WALLET',
  'X402_CREATOR_ACCEPT_NETWORKS',
  'X402_CREATOR_FACILITATOR_URL',
  'CREATOR_AGENT_X402_PAY_CHAIN',
  'CIRCLE_API_KEY',
  'CIRCLE_TEST_API_KEY',
  'CIRCLE_BASE_URL',
  'CIRCLE_CLI_ENABLED',
  'VITE_CIRCLE_EVM_EMAIL_ENABLED',
  'VITE_CIRCLE_USER_WALLET_APP_ID',
  'VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET',
  'AGENT_WALLET_SERVICE_SECRET',
  'DEFAULT_AGENT_SLUG',
  'DEFAULT_AGENT_WALLET_ADDRESS',
  'AGENT_WALLET_GATEWAY_BALANCE_CHAIN',
  'AGENT_WALLET_GATEWAY_DEPOSIT_CHAIN',
  'PRIVATE_RPC_URL_ARC',
  'VITE_RPC_URL_ARC',
  'ARC_POA_CONTRACT',
  'VITE_POA_CONTRACT',
  'RELAYER_PRIVATE_KEY_ARC',
  'STREAM_FACTORY_ADDRESS',
  'VITE_STREAM_FACTORY_ADDRESS',
  'PRIVY_APP_ID',
  'PRIVY_APP_SECRET',
  'VITE_PRIVY_APP_ID',
  'VITE_AUTH_BRIDGE',
  'POLY_STREAM_API_KEY',
  'POLYMARKET_MATCH_URLS',
]

const optional = [
  'CREATOR_WORLD_CUP_NEWS_URL',
  'CREATOR_WORLD_CUP_NEWS_PRICE_RAW',
  'CREATOR_WORLD_CUP_SCORES_PRICE_RAW',
  'RESEND_API_KEY',
]

function declaredInRender(key) {
  return new RegExp(`-\\s+key:\\s+${key}\\b`).test(renderYaml)
}

function localPresent(key) {
  return Boolean(process.env[key])
}

function envFilePresent(key) {
  return new RegExp(`^${key}=`, 'm').test(envFileText)
}

function commandExists(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { encoding: 'utf8' })
  return result.status === 0
}

const missingRender = required.filter(key => !declaredInRender(key))
const missingLocal = required.filter(key => !localPresent(key))
const missingEnvFile = required.filter(key => !envFilePresent(key))
const missingOptionalRender = optional.filter(key => !declaredInRender(key))
const circleCli = commandExists(process.platform === 'win32' ? 'circle.cmd' : 'circle') || commandExists('circle')

console.log('StreamPay Creator env audit')
console.log(`render required declared: ${required.length - missingRender.length}/${required.length}`)
console.log(`local process env present: ${required.length - missingLocal.length}/${required.length}`)
console.log(`local env file keys present: ${required.length - missingEnvFile.length}/${required.length}`)
console.log(`circle cli available locally: ${circleCli ? 'yes' : 'no'}`)
if (missingRender.length) console.log(`missing from render.yaml: ${missingRender.join(', ')}`)
if (missingOptionalRender.length) console.log(`optional missing from render.yaml: ${missingOptionalRender.join(', ')}`)
if (missingEnvFile.length) console.log(`missing from local env files: ${missingEnvFile.join(', ')}`)
if (missingLocal.length) console.log(`missing from local process env: ${missingLocal.join(', ')}`)
if (!existsSync(resolve(root, 'render.yaml'))) console.log('render.yaml not found')
