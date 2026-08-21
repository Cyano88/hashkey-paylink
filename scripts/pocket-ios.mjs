import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const action = process.argv[2] || 'sync'

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false })
  if (result.error) console.error(result.error.message)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!['add', 'sync'].includes(action)) {
  console.error('Use add or sync.')
  process.exit(1)
}

run(process.execPath, [
  '--max-old-space-size=4096',
  path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
  '--mode',
  'pocket-native',
])

const iosDir = path.join(root, 'ios')
const capacitorCli = path.join(root, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor')
if (!existsSync(iosDir)) run(process.execPath, [capacitorCli, 'add', 'ios'])
else run(process.execPath, [capacitorCli, 'sync', 'ios'])

// Capacitor can emit Windows separators into Swift package path strings when
// sync runs on Windows. Normalize them so the committed project is immediately
// parseable by Swift Package Manager on the macOS signing runner.
const swiftPackage = path.join(iosDir, 'App', 'CapApp-SPM', 'Package.swift')
if (existsSync(swiftPackage)) {
  const source = readFileSync(swiftPackage, 'utf8')
  const normalized = source.replace(/path: "([^"]+)"/g, (_match, value) => `path: "${value.replaceAll('\\', '/')}"`)
  if (normalized !== source) writeFileSync(swiftPackage, normalized)
}

console.log('iOS project ready at ios/App/App.xcodeproj. Compile and sign it on macOS with Xcode or CI.')
