import { readdir, lstat, readFile } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const MAX_BYTES = 32 * 1024 * 1024
const MAX_FILES = 2000
// No source files are changed. Paths and bodies stay within the service/database.
export async function collectDiskSnapshot(root) {
  root = resolve(root)
  const files = []
  let total = 0
  async function visit(path) {
    const info = await lstat(path)
    if (info.isSymbolicLink()) throw Error('Migration refuses symbolic links.')
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) {
        if (path === root && name === 'lost+found') continue
        await visit(resolve(path, name))
      }
      return
    }
    if (!info.isFile()) throw Error('Migration refuses special files.')
    if (files.length >= MAX_FILES || info.size + total > MAX_BYTES) throw Error('Migration size limit exceeded.')
    const bytes = await readFile(path)
    const after = await lstat(path)
    if (info.size !== after.size || info.mtimeMs !== after.mtimeMs || info.ino !== after.ino || bytes.length !== info.size) throw Error('Source changed during migration; retry after quiescing writes.')
    total += bytes.length
    if (total > MAX_BYTES) throw Error('Migration size limit exceeded.')
    files.push({ path: relative(root, path).split(sep).join('/'), bytes, digest: sha(bytes) })
  }
  await visit(root)
  const digest = sha(JSON.stringify(files.map(f => [f.path, f.digest, f.bytes.length])))
  return { files, bytes: total, digest }
}

export async function archiveDiskSnapshot(client, root) {
  const snapshot = await collectDiskSnapshot(root)
  const id = randomUUID()
  await client.query('begin')
  try {
    await client.query(`create table if not exists render_disk_migration_archives (
      archive_id uuid primary key, manifest_digest text not null,
      file_count integer not null, byte_count bigint not null,
      created_at timestamptz not null default now());
      create table if not exists render_disk_migration_files (
      archive_id uuid not null references render_disk_migration_archives(archive_id),
      relative_path text not null, content bytea not null, digest text not null,
      primary key (archive_id, relative_path));`)
    await client.query('insert into render_disk_migration_archives (archive_id,manifest_digest,file_count,byte_count) values ($1,$2,$3,$4)', [id,snapshot.digest,snapshot.files.length,snapshot.bytes])
    for (const file of snapshot.files) {
      await client.query('insert into render_disk_migration_files (archive_id,relative_path,content,digest) values ($1,$2,$3,$4)', [id,file.path,file.bytes,file.digest])
    }
    // Verify round-trip bytes, not only the digest supplied to the INSERT.
    const saved = await client.query('select relative_path,content,digest from render_disk_migration_files where archive_id=$1 order by relative_path', [id])
    if (saved.rows.length !== snapshot.files.length) throw Error('Archive count verification failed.')
    const originals = new Map(snapshot.files.map(f => [f.path, f]))
    for (const row of saved.rows) {
      const original = originals.get(row.relative_path)
      if (!original || !Buffer.isBuffer(row.content) || !row.content.equals(original.bytes) || sha(row.content) !== row.digest) throw Error('Archive byte verification failed.')
    }
    // Detect writes anywhere in the tree before committing this recovery copy.
    if ((await collectDiskSnapshot(root)).digest !== snapshot.digest) throw Error('Source changed during migration; archive rolled back.')
    await client.query('commit')
    return { archiveId: id, files: snapshot.files.length, bytes: snapshot.bytes, verified: true, runtimeCutover: false }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

async function main() {
  const mode = process.argv[2] || '--inspect'
  if (!['--inspect','--archive'].includes(mode)) throw Error('Use --inspect or --archive.')
  const root = process.env.DATA_PATH
  if (!root) throw Error('DATA_PATH must be explicitly configured.')
  if (mode === '--inspect') {
    const snapshot = await collectDiskSnapshot(root)
    console.log(JSON.stringify({files:snapshot.files.length,bytes:snapshot.bytes,runtimeCutover:false}))
    return
  }
  const require = createRequire(resolve(process.cwd(),'package.json'))
  const { Client } = require('pg')
  const url = new URL(process.env.DATABASE_URL || process.env.POSTGRES_URL || '')
  if (!['postgres:','postgresql:'].includes(url.protocol)) throw Error('Postgres is required.')
  const host = url.hostname.toLowerCase()
  const internal = ['localhost','127.0.0.1','[::1]'].includes(host) || host.endsWith('.internal') || !host.includes('.')
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key)
  const ca = String(process.env.DATABASE_CA_CERT || process.env.RENDER_POSTGRES_CA_CERT || '').trim().replace(/\\n/g,'\n')
  const client = new Client({connectionString:url.toString(),ssl:internal?false:{rejectUnauthorized:true,...(ca?{ca}:{})}})
  await client.connect()
  try { console.log(JSON.stringify(await archiveDiskSnapshot(client,root))) }
  finally { await client.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Disk migration stopped. No runtime cutover was performed; inspect service access, source stability and database availability.'); process.exitCode=1 })
}
