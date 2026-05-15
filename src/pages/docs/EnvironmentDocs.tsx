import { DocPage, DocHeader, Section, InfoBox, Table, NavFooter } from './components'

export default function EnvironmentDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Environment Variables"
        description="Complete reference for all required and optional environment variables. Copy .env.example from the repository root and fill in your values."
      />

      <InfoBox type="warning">Never commit private keys to version control. Use your hosting provider's secret manager (Render environment variables, Vercel env, etc.).</InfoBox>

      <Section title="0G Storage">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['OG_STORAGE_KEY',      'Yes', 'Private key of wallet holding OG tokens for gas on 0G Mainnet. Used to sign archive transactions.'],
            ['OG_ARCHIVE_ADDRESS',  'Yes', 'Deployed PayLinkArchive contract address on 0G Mainnet. Default: 0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'],
            ['OG_FROM_BLOCK',       'No',  'Block number to start scanning PaymentArchived events from. Default: 32498000. Set to the block of contract deployment.'],
          ]}
        />
      </Section>

      <Section title="EVM Relay (Base, Arc, HashKey, Arbitrum)">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['RELAYER_PRIVATE_KEY',          'Yes', 'Master EVM relayer key. Used for Base relay and as fallback for other chains.'],
            ['RELAYER_PRIVATE_KEY_ARC',       'No',  'Arc-specific relayer key. Falls back to RELAYER_PRIVATE_KEY.'],
            ['RELAYER_PRIVATE_KEY_HASHKEY',   'No',  'HashKey-specific relayer key. Falls back to RELAYER_PRIVATE_KEY.'],
            ['RELAYER_PRIVATE_KEY_ARB',       'No',  'Arbitrum-specific relayer key. Falls back to RELAYER_PRIVATE_KEY.'],
            ['TREASURY_ADDRESS',              'No',  'EVM treasury wallet that receives platform fees.'],
            ['ADMIN_SECRET',                   'Yes', 'Long random secret for protected maintenance endpoints. Keep separate from public VITE_ variables.'],
            ['CRON_SECRET',                    'No',  'Optional long random secret for authenticated cron/maintenance calls.'],
            ['PAYLINK_FACTORY_V2',            'Yes', 'PayLinkFactoryV2 contract address on Base.'],
            ['PAYLINK_FACTORY_V2_ARC',        'No',  'Factory address on Arc.'],
            ['PAYLINK_FACTORY_V2_HASHKEY',    'No',  'Factory address on HashKey.'],
            ['PAYLINK_FACTORY_V2_ARB',        'No',  'Factory address on Arbitrum.'],
            ['VITE_FACTORY_V2',               'Yes', 'Browser-accessible factory address (Base). Used by frontend to compute vault addresses.'],
            ['VITE_FACTORY_V2_ARC',           'No',  'Browser-accessible Arc factory.'],
            ['VITE_FACTORY_V2_ARB',           'No',  'Browser-accessible Arbitrum factory.'],
            ['CDP_PAYMASTER_URL',             'No',  'Server-side Coinbase/CDP Base Paymaster URL used by /api/base-paymaster.'],
            ['VITE_BASE_PAYMASTER_URL',       'No',  'Browser-visible paymaster proxy path. Use /api/base-paymaster.'],
            ['VITE_CIRCLE_PAYMASTER_ENABLED', 'No',  'Feature flag for Circle Paymaster on supported Base and Arbitrum smart-wallet paths.'],
            ['VITE_CIRCLE_BUNDLER_URL_BASE',  'No',  'ERC-4337 bundler RPC used by Circle Paymaster on Base. Default: public Pimlico Base endpoint.'],
            ['VITE_CIRCLE_BUNDLER_URL_ARB',   'No',  'ERC-4337 bundler RPC used by Circle Paymaster on Arbitrum. Default: public Pimlico Arbitrum endpoint.'],
            ['VITE_CIRCLE_PAYMASTER_V08_BASE','No',  'Circle Paymaster v0.8 address for Base. Override only if Circle rotates the address.'],
            ['VITE_CIRCLE_PAYMASTER_V08_ARB', 'No',  'Circle Paymaster v0.8 address for Arbitrum. Override only if Circle rotates the address.'],
            ['VITE_CLIENT_KEY',               'No',  'Circle Modular Wallets public client key. Required for the Continue with email gasless payment path.'],
            ['VITE_CLIENT_URL',               'No',  'Circle Modular Wallets client URL. Required for passkey login and gasless user operations.'],
            ['VITE_CIRCLE_EVM_EMAIL_ENABLED', 'No',  'Feature flag for Base/Arbitrum Circle User-Controlled SCA email wallet payments. Defaults to enabled unless explicitly false.'],
            ['VITE_CIRCLE_SOLANA_EMAIL_ENABLED','No','Feature flag for the Solana Circle User-Controlled Wallets email prototype.'],
            ['VITE_CIRCLE_USER_WALLET_APP_ID','No', 'Public Circle Wallet App ID used by the Solana email wallet Web SDK.'],
            ['CIRCLE_API_KEY',                'No',  'Server-side Circle API key for User-Controlled Wallet OTP, wallet, and signing calls. Never expose with VITE_.'],
            ['CIRCLE_BASE_URL',               'No',  'Circle API base URL. Defaults to https://api.circle.com.'],
            ['CIRCLE_SOLANA_BLOCKCHAIN',      'No',  'Circle blockchain identifier for Solana wallets. Defaults to SOL.'],
            ['VITE_BASE_GAS_RECOVERY_USDC',   'No',  'USDC amount routed to treasury on sponsored Base payments to offset gas sponsorship. Default: 0.01.'],
            ['VITE_ARBITRUM_GAS_RECOVERY_USDC','No', 'USDC amount routed to treasury on sponsored Arbitrum payments to offset gas sponsorship. Default: 0.03.'],
            ['BASE_GAS_RECOVERY_USDC',        'No',  'Server-side Base gas recovery amount for Circle User-Controlled EVM email payments. Default: 0.01.'],
            ['ARBITRUM_GAS_RECOVERY_USDC',    'No',  'Server-side Arbitrum gas recovery amount for Circle User-Controlled EVM email payments. Default: 0.03.'],
            ['PRIVATE_RPC_URL',               'No',  'Server-side Base RPC endpoint used by relays and dashboard event indexing.'],
            ['PRIVATE_RPC_URL_ARC',           'No',  'Arc RPC endpoint.'],
            ['PRIVATE_RPC_URL_HASHKEY',       'No',  'HashKey RPC endpoint.'],
            ['PRIVATE_RPC_URL_ARB',           'No',  'Arbitrum RPC endpoint.'],
            ['VITE_RPC_URL',                  'No',  'Frontend Base RPC fallback for wallet clients and lightweight reads.'],
            ['VITE_RPC_URL_BASE',             'No',  'Frontend Base RPC. Prefer a browser-safe restricted key. Falls back to VITE_RPC_URL, then public Base RPC.'],
            ['VITE_RPC_URL_ARC',              'No',  'Frontend Arc RPC for wallet clients and lightweight reads.'],
            ['VITE_RPC_URL_ARB',              'No',  'Frontend Arbitrum RPC for wallet clients and lightweight reads.'],
            ['VITE_RPC_URL_HASHKEY',          'No',  'Frontend HashKey RPC for wallet clients and lightweight reads.'],
            ['FACTORY_FROM_BLOCK',            'No',  'Server-side Base block from which to scan dashboard/factory events. Default: 45786000.'],
          ]}
        />
      </Section>

      <Section title="Solana Relay">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['RELAYER_PRIVATE_KEY_SOLANA', 'Yes', 'Solana relayer keypair. Accepts base58 string, JSON array, or base64 encoded.'],
            ['SOLANA_RPC_URL',             'No',  'Solana RPC endpoint. Falls back to mainnet-beta public RPC.'],
            ['SOLANA_TREASURY',            'No',  'Solana treasury wallet address for fee collection.'],
            ['SOLANA_GAS_RECOVERY_USDC',   'No',  'Server-side USDC amount routed to Solana treasury to offset sponsored SOL fees/rent. Default: 0.01.'],
          ]}
        />
      </Section>

      <Section title="Starknet Relay">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['STARKNET_RELAYER_ADDRESS',     'Yes', 'OZ Account address of the Starknet relayer on Starknet Mainnet.'],
            ['STARKNET_RELAYER_PRIVATE_KEY', 'Yes', 'Starknet relayer private key (hex, Stark curve).'],
            ['STARKNET_OZ_CLASS_HASH',       'No',  'OZ Account v0.8.1 class hash. Default: standard OZ class.'],
            ['STARKNET_RPC_URL',             'No',  'Starknet RPC endpoint. Falls back to public Starknet RPC.'],
            ['AVNU_API_KEY',                 'No',  'AVNU Paymaster API key for gas sponsorship. Optional — works without key on free tier.'],
          ]}
        />
      </Section>

      <Section title="Frontend">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['VITE_WALLETCONNECT_PROJECT_ID', 'Yes', 'WalletConnect project ID from cloud.walletconnect.com. Required for WalletConnect support.'],
            ['FIXER_API_KEY',                 'No',  'Fixer.io API key for live FX rates (NGN, GHS, KES, SGD). Optional — FX display disabled without it.'],
          ]}
        />
      </Section>

      <Section title="StreamPay">
        <Table
          headers={['Variable', 'Required', 'Description']}
          rows={[
            ['STREAM_FACTORY_ADDRESS',      'StreamPay only', 'StreamVaultFactory contract on Arc.'],
            ['VITE_STREAM_FACTORY_ADDRESS', 'StreamPay only', 'Browser-accessible StreamVaultFactory address.'],
            ['ARC_POA_CONTRACT',            'StreamPay only', 'PoASettlement contract on Arc.'],
            ['VITE_POA_CONTRACT',           'StreamPay only', 'Browser-accessible PoASettlement address.'],
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
