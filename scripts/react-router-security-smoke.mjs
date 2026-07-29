import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

assert.equal(
  packageJson.dependencies?.['react-router-dom'],
  '7.18.2',
  'React Router must stay pinned to the reviewed SPA-compatible security release.',
)

for (const dependencyGroup of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  const dependencies = packageJson[dependencyGroup] ?? {}
  assert.equal(
    Object.keys(dependencies).some((name) => name.startsWith('@react-router/')),
    false,
    `React Router framework/RSC packages must not be present in ${dependencyGroup}.`,
  )
}

const forbiddenRscTokens = [
  '@react-router/dev',
  '@react-router/node',
  'createRequestHandler',
  'HydratedRouter',
  'RSCStaticRouter',
  'RSCStream',
  'ServerRouter',
  'react-server-dom',
]
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])
const sourceRoots = ['api', 'src', 'vite.config.ts']

function inspectSource(targetPath) {
  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      inspectSource(path.join(targetPath, entry.name))
    }
    return
  }
  if (!sourceExtensions.has(path.extname(targetPath))) return

  const source = fs.readFileSync(targetPath, 'utf8')
  for (const token of forbiddenRscTokens) {
    assert.equal(
      source.includes(token),
      false,
      `React Router RSC/server token "${token}" found in ${path.relative(root, targetPath)}.`,
    )
  }
}

for (const sourceRoot of sourceRoots) {
  inspectSource(path.join(root, sourceRoot))
}

console.log('React Router SPA-only security posture checks passed.')
