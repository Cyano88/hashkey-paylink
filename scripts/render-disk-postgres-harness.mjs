import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const pgBin = process.env.HASHPAYSTREAM_TEST_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin/'
const port = 55441
const directory = mkdtempSync(join(tmpdir(), 'hashpaylink-migration-pg-'))
const run = (file) => spawnSync(process.execPath, ['--import', 'tsx', file], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, MIGRATION_TEST_DATABASE_URL: `postgresql://trade_test@127.0.0.1:${port}/postgres` },
  encoding: 'utf8', windowsHide: true,
})
try {
  const initialized = spawnSync(pgBin + 'initdb.exe', ['-D', directory, '-U', 'trade_test', '-A', 'trust', '--encoding=UTF8', '--no-locale'], { encoding: 'utf8', windowsHide: true })
  assert.equal(initialized.status, 0, initialized.stderr || 'isolated PostgreSQL initialization failed')
  const started = spawnSync(pgBin + 'pg_ctl.exe', ['-D', directory, '-l', join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  assert.equal(started.status, 0, started.stderr || 'isolated PostgreSQL startup failed')
  for (const file of ['scripts/migrated-json-store-smoke.mjs']) {
    const result = run(file)
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    assert.equal(result.status, 0, `${file} failed`)
  }
  console.log('Disk migration isolated PostgreSQL harness passed.')
} finally {
  spawnSync(pgBin + 'pg_ctl.exe', ['-D', directory, '-m', 'immediate', '-w', 'stop'], { windowsHide: true, stdio: 'ignore', timeout: 30_000 })
}
