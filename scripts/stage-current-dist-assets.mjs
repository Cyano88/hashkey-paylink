import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const htmlPath = path.join('dist', 'index.html')
if (!fs.existsSync(htmlPath)) {
  console.error('Missing dist/index.html. Run npx vite build --emptyOutDir false first.')
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, 'utf8')
const queue = [...html.matchAll(/\/assets\/([^"'\s>]+)/g)].map(match => path.join('dist', 'assets', match[1]))
const seen = new Set()
const missing = []
const assetRef = /(?:\.\/|assets\/|\/assets\/)([A-Za-z0-9_.-]+\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?))/g

while (queue.length) {
  const file = queue.shift()
  if (!file || seen.has(file)) continue
  seen.add(file)
  if (!fs.existsSync(file)) {
    missing.push(file)
    continue
  }
  const ext = path.extname(file)
  if (ext !== '.js' && ext !== '.css') continue
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(assetRef)) {
    const next = path.join('dist', 'assets', match[1])
    if (!seen.has(next)) queue.push(next)
  }
}

if (missing.length > 0) {
  console.error(`Missing dist assets:\n${missing.join('\n')}`)
  process.exit(1)
}

const files = [htmlPath, ...[...seen].sort()]
execFileSync('git', ['add', '-f', ...files], { stdio: 'inherit' })
console.log(`Staged ${files.length} dist files`)
