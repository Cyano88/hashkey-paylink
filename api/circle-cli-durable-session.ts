import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve, relative, sep, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type pg from 'pg'
import { readDurableJson, withDurableSessionLock } from './render-durable-store.js'

type Files = Record<string, string>
type Session = { version: 1; files: Files; phase: 'ready' | 'running' | 'recovery_required'; updatedAt: number }
const MAX_BYTES = 16 * 1024 * 1024
const MAX_FILES = 1000
export const circleCliSessionStoreKey = (key: string) => 'hashpaylink:circle-cli-session:' + createHash('sha256').update(key).digest('hex')

function validateFiles(value: unknown): asserts value is Files {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid wallet session snapshot.')
  const entries = Object.entries(value)
  if (entries.length > MAX_FILES) throw new Error('Wallet session snapshot exceeds limits.')
  let bytes = 0
  for (const [name, encoded] of entries) {
    if (!name || name.includes('\\') || name.includes(':') || name.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(name)) throw new Error('Unsafe wallet session path.')
    if (typeof encoded !== 'string' || encoded.length > MAX_BYTES * 2 || Buffer.from(encoded, 'base64').toString('base64') !== encoded) throw new Error('Invalid wallet session content.')
    bytes += Buffer.byteLength(encoded, 'base64')
    if (bytes > MAX_BYTES) throw new Error('Wallet session snapshot exceeds limits.')
  }
}
function validateSession(value: unknown): asserts value is Session {
  const session = value as Session
  if (!session || session.version !== 1 || !['ready','running','recovery_required'].includes(session.phase)) throw new Error('Invalid durable wallet session.')
  validateFiles(session.files)
}
export async function captureCircleSession(root: string): Promise<Files> {
  const files: Files = Object.create(null)
  let total = 0
  async function walk(path: string) {
    const before = await lstat(path)
    if (before.isSymbolicLink()) throw new Error('Wallet session contains a symbolic link.')
    if (before.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await walk(join(path, entry))
      return
    }
    if (!before.isFile() || Object.keys(files).length >= MAX_FILES || total + before.size > MAX_BYTES) throw new Error('Unsupported wallet session file.')
    const data = await readFile(path)
    const after = await lstat(path)
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || data.length !== before.size) throw new Error('Wallet session changed while being saved.')
    total += data.length
    files[relative(root, path).split(sep).join('/')] = data.toString('base64')
  }
  await walk(root)
  validateFiles(files)
  return files
}
export async function restoreCircleSession(files: Files): Promise<string> {
  validateFiles(files)
  const root = await mkdtemp(join(tmpdir(), 'hashpaylink-circle-session-'))
  try {
    for (const [name, encoded] of Object.entries(files)) {
      const target = resolve(root, ...name.split('/'))
      if (!target.startsWith(root + sep)) throw new Error('Unsafe wallet session path.')
      await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      await writeFile(target, Buffer.from(encoded, 'base64'), { mode: 0o600, flag: 'wx' })
    }
    return root
  } catch (error) { await removeTemporaryCircleSession(root); throw error }
}
export async function removeTemporaryCircleSession(root: string) {
  const resolved = resolve(root)
  const parent = resolve(tmpdir())
  if (dirname(resolved) !== parent || !relative(parent, resolved).startsWith('hashpaylink-circle-session-')) throw new Error('Refusing unsafe session cleanup.')
  await rm(resolved, { recursive: true, force: true })
}
async function load(client: pg.PoolClient, storeKey: string): Promise<Session | undefined> {
  const result = await client.query('select value from render_durable_kv where store_key=$1', [storeKey])
  if (!result.rows.length) return undefined
  validateSession(result.rows[0].value)
  return result.rows[0].value
}
async function save(client: pg.PoolClient, key: string, session: Session) {
  validateSession(session)
  await client.query(`insert into render_durable_kv (store_key,value,updated_at) values ($1,$2::jsonb,now())
    on conflict (store_key) do update set value=excluded.value,updated_at=now()`, [key, JSON.stringify(session)])
}
async function initialize(client: pg.PoolClient, key: string, source: string, allowEmpty: boolean) {
  const existing = await load(client, key)
  if (existing) return existing
  let files: Files
  try { files = await captureCircleSession(source) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !allowEmpty) throw new Error('Wallet session must be migrated before use.')
    // Only a missing root can initialize a new session, not a vanished child.
    try { await lstat(source); throw new Error('Wallet session changed during migration.') }
    catch (rootError) { if ((rootError as NodeJS.ErrnoException).code !== 'ENOENT') throw rootError }
    files = {}
  }
  const session: Session = { version: 1, files, phase: 'ready', updatedAt: Date.now() }
  await save(client, key, session)
  return session
}
export async function migrateCircleSession(key: string, source: string) {
  const storeKey = circleCliSessionStoreKey(key)
  return withDurableSessionLock(storeKey, async client => {
    const session = await initialize(client, storeKey, source, false)
    const restored = await restoreCircleSession(session.files)
    try {
      const roundtrip = await captureCircleSession(restored)
      if (JSON.stringify(Object.entries(roundtrip).sort()) !== JSON.stringify(Object.entries(session.files).sort())) throw new Error('Wallet session restore verification failed.')
      return { files: Object.keys(session.files).length, phase: session.phase, restored: true }
    } finally { await removeTemporaryCircleSession(restored) }
  })
}
export async function readCircleSessionFiles(key: string): Promise<Files | undefined> {
  const session = await readDurableJson<Session>(circleCliSessionStoreKey(key))
  if (!session) return undefined
  validateSession(session)
  return session.files
}
// Only explicitly enumerated read operations and login can avoid the payment
// uncertainty barrier. Unknown commands are treated as potentially financial.
export function circleCommandKind(args: string[]): 'read' | 'login' | 'financial' {
  if (args[0] === 'services' && ['search','inspect'].includes(args[1])) return 'read'
  if (args[0] === 'services' && args[1] === 'pay' && args.includes('--estimate')) return 'read'
  if (args[0] === 'wallet' && args[1] === 'login') return 'login'
  if ((args[0] === 'wallet' && ['list','balance'].includes(args[1])) || (args[0] === 'gateway' && args[1] === 'balance')) return 'read'
  return 'financial'
}
export async function assertCircleSessionPortability() {
  const keychain = process.platform === 'linux' ? '/usr/bin/secret-tool' : process.platform === 'darwin' ? '/usr/bin/security' : undefined
  if (!keychain) return
  try { await lstat(keychain) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  throw new Error('This host requires a reviewed Circle keychain adapter before wallet sessions can run.')
}
export async function withCircleSession<T>(input: { key: string; source: string; args: string[] }, execute: (home: string) => Promise<T>): Promise<T> {
  await assertCircleSessionPortability()
  const storeKey = circleCliSessionStoreKey(input.key)
  const kind = circleCommandKind(input.args)
  const allowEmpty = (kind === 'login' && input.args.includes('--init')) || (input.args[0] === 'services' && ['search','inspect'].includes(input.args[1]))
  return withDurableSessionLock(storeKey, async client => {
    const session = await initialize(client, storeKey, input.source, allowEmpty)
    if (session.phase !== 'ready' && kind === 'financial') throw new Error('An earlier wallet operation needs reconciliation before another payment.')
    const root = await restoreCircleSession(session.files)
    const priorPhase = session.phase
    let saved = false
    try {
      // Commit intent before invoking an external process. Never roll it back
      // on process death, connection loss or uncertain external completion.
      await save(client, storeKey, { ...session, phase: priorPhase === 'ready' ? 'running' : priorPhase, updatedAt: Date.now() })
      let result!: T
      let failed = false
      let failure: unknown
      try { result = await execute(root) } catch (error) { failed = true; failure = error }
      const files = await captureCircleSession(root)
      const phase = priorPhase !== 'ready' ? priorPhase : failed && kind === 'financial' ? 'recovery_required' : 'ready'
      await save(client, storeKey, { version: 1, files, phase, updatedAt: Date.now() })
      saved = true
      if (failed) throw failure
      return result
    } finally {
      // Retain local evidence if durable persistence failed. The committed
      // running marker blocks automatic replay after a restart.
      if (saved) await removeTemporaryCircleSession(root).catch(() => undefined)
    }
  })
}
