import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const apply = process.argv.includes('--apply')
const htmlPath = path.join('dist', 'index.html')
const gitPath = file => file.split(path.sep).join('/')
if (!fs.existsSync(htmlPath)) {
  console.error('Missing dist/index.html. Run npx vite build --emptyOutDir false first.')
  process.exit(1)
}

const html = fs.readFileSync(htmlPath, 'utf8')
const queue = [...html.matchAll(/\/assets\/([^"'\s>]+)/g)].map(match => gitPath(path.join('dist', 'assets', match[1])))
const current = new Set()
const assetRef = /(?:\.\/|assets\/|\/assets\/)([A-Za-z0-9_.-]+\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?))/g

while (queue.length) {
  const file = queue.shift()
  if (!file || current.has(file) || !fs.existsSync(file)) continue
  current.add(file)
  const ext = path.extname(file)
  if (ext !== '.js' && ext !== '.css') continue
  const text = fs.readFileSync(file, 'utf8')
  for (const match of text.matchAll(assetRef)) {
    const next = gitPath(path.join('dist', 'assets', match[1]))
    if (!current.has(next) && fs.existsSync(next)) queue.push(next)
  }
}

const tracked = execFileSync('git', ['ls-files', 'dist/assets'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
const stale = tracked.filter(file => !current.has(file))

if (!apply) {
  console.log(`Current assets: ${current.size}`)
  console.log(`Tracked assets: ${tracked.length}`)
  console.log(`Stale tracked assets: ${stale.length}`)
  if (stale.length > 0) console.log(stale.slice(0, 25).join('\n'))
  console.log('Run with --apply to remove stale tracked assets.')
  process.exit(0)
}

const assetsRoot = path.resolve('dist', 'assets')
for (const file of stale) {
  const absolute = path.resolve(file)
  if (!absolute.startsWith(`${assetsRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove outside dist/assets: ${absolute}`)
  }
  if (fs.existsSync(absolute)) fs.unlinkSync(absolute)
}

execFileSync('git', ['add', '-u', 'dist/assets'], { stdio: 'inherit' })
console.log(`Removed ${stale.length} stale tracked dist assets. Current assets kept: ${current.size}.`)
