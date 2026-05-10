import { DocPage, DocHeader, Section, SubSection, InfoBox, Table, Code, NavFooter } from './components'

export default function Chains() {
  return (
    <DocPage>
      <DocHeader
        title="Supported Chains"
        description="Hash PayLink supports six chains with distinct gasless mechanisms. Payers never need native gas tokens on any chain except HashKey."
      />

      <Section title="Chain overview">
        <Table
          headers={['Chain', 'Asset', 'Gas model', 'Chain ID']}
          rows={[
            ['Base',     'USDC',  'EIP-2612 permit + Multicall3 or CREATE2 ghost vault', '8453'],
            ['HashKey',  'HSK + USDC', 'Direct native HSK transfer (~0.0001 HSK)', '177'],
            ['Arc',      'USDC',  'EIP-2612 permit + Multicall3 or CREATE2 ghost vault', '5042002'],
            ['Starknet', 'USDC',  'AVNU Paymaster sponsors all STRK fees',              'SN_MAIN'],
            ['Solana',   'USDC',  'Relayer keypair covers all SOL fees',                 'mainnet-beta'],
            ['Arbitrum', 'USDC',  'Relayer covers ETH gas for stablecoin transfer',      '42161'],
          ]}
        />
      </Section>

      <Section title="Base">
        <SubSection title="EIP-2612 Permit + Multicall3">
          <p>The payer signs an off-chain EIP-712 typed message (permit) authorizing USDC spending. Hash PayLink first attempts to submit the Multicall3 payment through Coinbase/CDP Paymaster when configured and supported by the connected Base wallet. If sponsorship is unavailable, it falls back to the standard wallet transaction path.</p>
        </SubSection>
        <SubSection title="CREATE2 Ghost Vault">
          <p>The Send via Address flow computes a deterministic vault address using CREATE2. The payer sends USDC directly to this address from any wallet or CEX without connecting a browser extension. The relayer detects the deposit and sweeps funds to the recipient, covering ETH gas. The payer contributes only USDC.</p>
        </SubSection>
        <InfoBox type="info">Base transactions include the ERC-8021 builder code <Code>bc_8qtb7tny</Code> as per the Base App Store listing.</InfoBox>
      </Section>

      <Section title="HashKey Chain">
        <p>HashKey Chain uses native HSK for gas. Payers must hold a small amount of HSK (~0.0001 HSK) to cover the transfer fee. USDC is the payment asset. Direct native transfers are used — no permit or vault mechanism.</p>
        <InfoBox type="warning">HashKey is the only chain where payers need a small amount of native gas token. All other chains are fully gasless for the payer.</InfoBox>
        <Table
          headers={['Property', 'Value']}
          rows={[
            ['Chain ID',     '177'],
            ['RPC',          'https://mainnet.hsk.xyz'],
            ['Explorer',     'https://explorer.hashkey.com'],
            ['Gas asset',    'HSK'],
            ['Payment asset','USDC'],
          ]}
        />
      </Section>

      <Section title="Arc">
        <p>Arc uses the same gasless mechanisms as Base — EIP-2612 permit + Multicall3 for connected wallets, and CREATE2 ghost vaults for Send via Address. Arc uses a separate relayer key and factory contract.</p>
        <Table
          headers={['Property', 'Value']}
          rows={[
            ['Chain ID',  '5042002'],
            ['RPC',       'https://rpc.testnet.arc.network'],
            ['Explorer',  'https://testnet.arcscan.app'],
            ['Factory',   'VITE_FACTORY_V2_ARC env var'],
            ['Relayer key', 'RELAYER_PRIVATE_KEY_ARC env var'],
          ]}
        />
        <InfoBox type="info">Arc is currently configured for Arc Testnet (Chain ID 5042002). Swap these values when Arc Mainnet details are published.</InfoBox>
      </Section>

      <Section title="Starknet">
        <p>Starknet uses the AVNU Paymaster to sponsor all STRK gas fees. The payer needs only USDC in their Starknet wallet. Hash PayLink builds a SNIP-9 v2 typed data transaction with atomic account deployment + transfer, signs it, and submits via AVNU.</p>
        <SubSection title="Ghost vault on Starknet">
          <p>Send via Address on Starknet uses a counterfactual OZ Account v0.8.1 address. The vault address is computed deterministically using <Code>calculateContractAddressFromHash</Code> — no deployment needed until the first transaction. The relayer deploys and sweeps atomically.</p>
        </SubSection>
        <SubSection title="Compatible wallets">
          <p>ArgentX and Braavos are the recommended Starknet wallets. Both support SNIP-9 typed data signing. The Starknet address format is 66 characters: <Code>0x</Code> + 64 hex digits.</p>
        </SubSection>
        <Table
          headers={['Property', 'Value']}
          rows={[
            ['Network', 'Starknet Mainnet'],
            ['USDC contract', '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'],
            ['Paymaster', 'AVNU (api.avnu.fi)'],
            ['OZ Account class', 'STARKNET_OZ_CLASS_HASH env var'],
          ]}
        />
      </Section>

      <Section title="Solana">
        <p>The Hash PayLink relayer keypair pays all SOL transaction fees. Payers sign only the USDC transfer instruction — no SOL required. The relayer acts as the fee payer on every Solana transaction.</p>
        <SubSection title="Send via Address on Solana">
          <p>Each payment link generates a deterministic Associated Token Account (ATA) vault. The payer sends USDC to the ATA. The relayer polls for deposits, sweeps the balance to the recipient's ATA, and closes the vault ATA to recover ~0.002 SOL rent — keeping the relayer self-funded over time.</p>
        </SubSection>
        <SubSection title="Compatible wallets">
          <p>Phantom and Solflare are supported. The Solana recipient address is a base58-encoded public key.</p>
        </SubSection>
      </Section>

      <Section title="Arbitrum">
        <p>Arbitrum support uses Circle native USDC on Arbitrum One. The relayer covers ETH gas for connected-wallet relays and ghost-vault sweeps, keeping the payer experience aligned with Hash PayLink's gas-sponsored USDC flow.</p>
        <InfoBox type="info">Use native Arbitrum USDC at <Code>0xaf88d065e77c8cC2239327C5EDb3A432268e5831</Code>. Do not send bridged USDC.e to Hash PayLink Arbitrum vaults.</InfoBox>
        <Table
          headers={['Property', 'Value']}
          rows={[
            ['Chain ID',     '42161'],
            ['Asset',        'USDC (6 decimals)'],
            ['Relayer key',  'RELAYER_PRIVATE_KEY_ARB env var'],
            ['Factory',      'PAYLINK_FACTORY_V2_ARB env var'],
          ]}
        />
      </Section>

      <NavFooter
        prev={{ label: 'Payment Links', path: '/docs/payment-links' }}
        next={{ label: '0G Storage', path: '/docs/0g-storage' }}
      />
    </DocPage>
  )
}
