import { existsSync } from 'node:fs'
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

console.log('Using committed prebuilt frontend in dist.')
