import { DocPage, DocHeader, Section, InfoBox, Table, NavFooter } from './components'

export default function EnvironmentDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Environment Variables"
        description="Current production configuration for the Render-hosted Hash PayLink app."
      />

      <InfoBox type="warning">Never commit private keys, API keys, handoff files, or local environment files. Use Render environment variables for production secrets.</InfoBox>

      <Section title="Core app">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['DATABASE_URL', 'Yes', 'Render Postgres URL for Telegram state, PolyDesk profiles, Privy/Circle mappings, and Arena rooms.'],
            ['ADMIN_SECRET', 'Yes', 'Long random secret for protected maintenance endpoints.'],
            ['CRON_SECRET', 'Optional', 'Secret for authenticated cron or background jobs.'],
            ['TREASURY_ADDRESS', 'Optional', 'EVM treasury wallet for platform fees.'],
          ]}
        />
      </Section>

      <Section title="Privy and Circle">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['PRIVY_APP_ID', 'Yes', 'Privy app ID for email-first user sessions.'],
            ['PRIVY_APP_SECRET', 'Yes', 'Server-side Privy secret for authenticated API actions.'],
            ['VITE_PRIVY_APP_ID', 'Yes', 'Public Privy app ID used by the browser.'],
            ['CIRCLE_API_KEY', 'Required for mainnet Circle flows', 'Server-side Circle API key. Never expose with VITE_.'],
            ['CIRCLE_TEST_API_KEY', 'Required for Arc Testnet Circle flows', 'Server-side Circle testnet API key. Never expose with VITE_.'],
            ['CIRCLE_BASE_URL', 'Optional', 'Circle API base URL. Defaults to https://api.circle.com.'],
            ['VITE_CIRCLE_USER_WALLET_APP_ID', 'Optional', 'Public Circle wallet app ID for browser wallet sessions.'],
            ['VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET', 'Optional', 'Arc Testnet-specific Circle wallet app ID.'],
          ]}
        />
      </Section>

      <Section title="EVM payments">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['RELAYER_PRIVATE_KEY', 'Yes', 'Base relayer key and fallback EVM relayer.'],
            ['RELAYER_PRIVATE_KEY_ARC', 'Arc flows', 'Arc-specific relayer key. Falls back to RELAYER_PRIVATE_KEY.'],
            ['RELAYER_PRIVATE_KEY_ARB', 'Arbitrum flows', 'Arbitrum-specific relayer key. Falls back to RELAYER_PRIVATE_KEY.'],
            ['PAYLINK_FACTORY_V2', 'Yes', 'Base PayLinkFactoryV2 address.'],
            ['PAYLINK_FACTORY_V2_ARC', 'Arc flows', 'Arc factory address.'],
            ['PAYLINK_FACTORY_V2_ARB', 'Arbitrum flows', 'Arbitrum factory address.'],
            ['VITE_FACTORY_V2', 'Yes', 'Browser-visible Base factory address.'],
            ['VITE_FACTORY_V2_ARC', 'Arc flows', 'Browser-visible Arc factory address.'],
            ['VITE_FACTORY_V2_ARB', 'Arbitrum flows', 'Browser-visible Arbitrum factory address.'],
            ['PRIVATE_RPC_URL', 'Optional', 'Server-side Base RPC endpoint.'],
            ['PRIVATE_RPC_URL_ARC', 'Optional', 'Server-side Arc RPC endpoint.'],
            ['PRIVATE_RPC_URL_ARB', 'Optional', 'Server-side Arbitrum RPC endpoint.'],
          ]}
        />
      </Section>

      <Section title="Solana">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['RELAYER_PRIVATE_KEY_SOLANA', 'Solana flows', 'Solana relayer keypair. Accepts base58, JSON array, or base64.'],
            ['SOLANA_RPC_URL', 'Optional', 'Solana RPC endpoint.'],
            ['SOLANA_TREASURY', 'Optional', 'Solana treasury wallet for fee collection.'],
            ['SOLANA_GAS_RECOVERY_USDC', 'Optional', 'USDC amount routed to treasury to offset sponsored SOL fees.'],
          ]}
        />
      </Section>

      <Section title="0G Storage">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['OG_STORAGE_KEY', '0G archiving', 'Private key for 0G storage/archive transactions.'],
            ['OG_RPC_URL', 'Optional but recommended', 'Preferred server-side 0G EVM RPC endpoint. Falls back to the public 0G RPC when unset. Do not expose with VITE_.'],
            ['OG_INDEXER_RPC_URL', 'Optional but recommended', 'Preferred server-side 0G storage indexer endpoint. Falls back to the public 0G indexer when unset. Do not expose with VITE_.'],
            ['OG_ARCHIVE_ADDRESS', '0G archiving', 'PayLinkArchive contract address on 0G.'],
            ['OG_FROM_BLOCK', 'Optional', 'Block number to start scanning archive events.'],
          ]}
        />
      </Section>

      <Section title="PolyDesk">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['POLYMARKET_BUILDER_CODE', 'PolyDesk attribution', 'Polymarket builder code for bridge calls and future CLOB order attribution.'],
            ['FANVIBE_WORLD_CUP_FEED_URL', 'World Cup board', 'FanVibe World Cup feed used as the source of truth before direct sports-provider fallback.'],
            ['SPORTMONKS_API_KEY', 'World Cup board', 'Sportmonks API key for live fixtures and scores.'],
            ['NEWS_API_KEY', 'News feed', 'News provider API key.'],
            ['RESEND_API_KEY', 'Email alerts', 'Resend API key for portfolio and LP Scout email notifications.'],
          ]}
        />
      </Section>

      <Section title="StreamPay and Arena">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['STREAM_FACTORY_ADDRESS', 'StreamPay', 'StreamVaultFactory contract on Arc.'],
            ['VITE_STREAM_FACTORY_ADDRESS', 'StreamPay', 'Browser-visible StreamVaultFactory address.'],
            ['ARENA_ESCROW_FACTORY_ADDRESS', 'Arena', 'Arena escrow factory address.'],
            ['VITE_ARENA_ESCROW_FACTORY_ADDRESS', 'Arena', 'Browser-visible Arena escrow factory address.'],
            ['ARENA_RELAYER_PRIVATE_KEY', 'Arena', 'Server-side relayer key for Arena escrow actions.'],
          ]}
        />
      </Section>

      <NavFooter
        prev={{ label: 'Wallet Setup', path: '/docs/wallets' }}
        next={{ label: 'Overview', path: '/docs' }}
      />
    </DocPage>
  )
}
