import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const action = process.argv[2] || 'sync'

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!['add', 'sync', 'bundle'].includes(action)) {
  console.error('Use add, sync, or bundle.')
  process.exit(1)
}

run('npm.cmd', ['run', 'build:pocket-mobile'])

const androidDir = path.join(root, 'android')
if (!existsSync(androidDir)) run('npx.cmd', ['cap', 'add', 'android'])
else run('npx.cmd', ['cap', 'sync', 'android'])

if (action === 'bundle') run('gradlew.bat', ['bundleRelease'], androidDir)
