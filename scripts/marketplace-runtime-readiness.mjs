import {marketplaceRuntimeReadiness} from '../api/marketplace/runtime.ts'

// Reads only the process environment. Does not load local env files or call providers.
console.log(JSON.stringify(marketplaceRuntimeReadiness(),null,2))
