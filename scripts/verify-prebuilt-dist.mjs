import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const requiredFiles = [
  join('dist', 'index.html'),
]

const missing = requiredFiles.filter((file) => !existsSync(file))

if (missing.length > 0) {
  console.error(`Missing prebuilt frontend output: ${missing.join(', ')}`)
  console.error('Run npm run build:frontend locally and commit dist before deploying to Render.')
  process.exit(1)
}

const html = readFileSync(join('dist', 'index.html'), 'utf8')
const queue = [...html.matchAll(/\/assets\/([^"'\s>]+)/g)].map(match => join('dist', 'assets', match[1]))
const seen = new Set()
const missingAssets = []
const assetRef = /(?:\.\/|assets\/|\/assets\/)([A-Za-z0-9_.-]+\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?))/g

while (queue.length) {
  const file = queue.shift()
  if (!file || seen.has(file)) continue
  seen.add(file)
  if (!existsSync(file)) {
    missingAssets.push(file)
    continue
  }
  if (!file.endsWith('.js') && !file.endsWith('.css')) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(assetRef)) {
    const next = join('dist', 'assets', match[1])
    if (!seen.has(next)) queue.push(next)
  }
}

if (missingAssets.length > 0) {
  console.error(`Missing prebuilt frontend assets: ${missingAssets.join(', ')}`)
  console.error('Run npx vite build --emptyOutDir false and commit the current dist asset closure.')
  process.exit(1)
}

console.log(`Using committed prebuilt frontend in dist (${seen.size} assets verified).`)
