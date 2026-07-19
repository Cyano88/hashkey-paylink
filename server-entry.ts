import { config as loadEnv } from 'dotenv'

// Load local configuration before importing the server module graph. Several
// durable adapters intentionally initialize their connection pools at module
// load time, so loading dotenv inside server.ts is too late for local runs.
loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

await import('./server.js')
