import { mkdir, lstat, readFile, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

function dpapi(value, decrypt = false) {
  const script = "Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); " + (decrypt
    ? "[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"
    : "[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))")
  const result = spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { input: value, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 32768 })
  if (result.error || result.status !== 0 || !result.stdout) throw new Error('Protected credential storage is unavailable.')
  return result.stdout
}
export function createSessionStore({ directory = join(homedir(), '.hashpaylink'), platform = process.platform, protect = value => dpapi(value), unprotect = value => dpapi(value, true), filename = 'cli-session.json', validate = session => /^hpl_cli_[a-f0-9]{64}$/.test(session.token) && Boolean(session.grant?.id) } = {}) {
  if (!['cli-session.json', 'cli-vault.json'].includes(filename)) throw new Error('Invalid credential store.')
  const path = join(directory, filename)
  async function safeDirectory() {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (platform !== 'win32' && (stat.mode & 0o077))) throw new Error('Credential directory must be private and must not be a link.')
  }
  async function read() {
    try {
      await safeDirectory()
      const stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768 || (platform !== 'win32' && (stat.mode & 0o077))) throw new Error('Credential file is not private.')
      const envelope = JSON.parse(await readFile(path, 'utf8'))
      if (envelope.protection !== (platform === 'win32' ? 'dpapi-user' : 'file-mode-0600')) throw new Error('Credential protection does not match this operating system.')
      const session = JSON.parse(platform === 'win32' ? unprotect(envelope.value) : envelope.value)
      if (!validate(session)) throw new Error('Credential file is invalid.')
      return session
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw new Error('Cannot read protected CLI credentials. Check local file permissions.')
    }
  }
  async function write(session) {
    await safeDirectory()
    if (!validate(session)) throw new Error('Invalid credential data.')
    const value = JSON.stringify(session)
    if (Buffer.byteLength(value, 'utf8') > 20000) throw new Error('Protected credential store is full.')
    const envelope = JSON.stringify({ protection: platform === 'win32' ? 'dpapi-user' : 'file-mode-0600', value: platform === 'win32' ? protect(value) : value })
    const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp'
    let handle
    try {
      handle = await open(temporary, 'wx', 0o600)
      await handle.writeFile(envelope, 'utf8')
      await handle.close(); handle = undefined
      await rename(temporary, path)
    } finally {
      await handle?.close()
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }
  return { read, write, async withLock(operation) {
    await safeDirectory()
    let lock
    try { lock = await open(path + '.lock', 'wx', 0o600) }
    catch { throw new Error('Credential store is locked by another operation. Retry after it completes.') }
    try { await lock.writeFile(String(process.pid)); return await operation() }
    finally { await lock.close(); await unlink(path + '.lock') }
  }, async clear() { await safeDirectory(); await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error }) } }
}

export function createVaultStore(options = {}) {
  return createSessionStore({ ...options, filename: 'cli-vault.json', validate: value => Array.isArray(value?.keys) && Array.isArray(value?.plans) })
}
