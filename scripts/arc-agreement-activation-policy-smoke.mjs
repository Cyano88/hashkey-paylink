import { runReviewedMainnetFixture } from './lib/reviewed-mainnet-fixture.mjs'
await runReviewedMainnetFixture(new URL('./fixtures/arc-agreement-activation-policy.mjs', import.meta.url), import.meta.url)
