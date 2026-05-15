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
            ['Base',     'USDC',  'Circle smart wallet, Coinbase/CDP Paymaster, normal wallet fallback, or CREATE2 ghost vault', '8453'],
            ['HashKey',  'HSK + USDC', 'Direct native HSK transfer (~0.0001 HSK)', '177'],
            ['Arc',      'USDC',  'EIP-2612 permit + Multicall3 or CREATE2 ghost vault', '5042002'],
            ['Starknet', 'USDC',  'AVNU Paymaster sponsors all STRK fees',              'SN_MAIN'],
            ['Solana',   'USDC',  'Circle/connected wallet signs; Hash PayLink relayer pays SOL fees/rent', 'mainnet-beta'],
            ['Arbitrum', 'USDC',  'Connected-wallet relayer, Circle Paymaster / smart wallet, or CREATE2 ghost vault', '42161'],
          ]}
        />
      </Section>

      <Section title="Base">
        <SubSection title="Connected wallet">
          <p>The payer signs an off-chain EIP-712 typed message (permit) authorizing USDC spending. Hash PayLink first attempts Coinbase/CDP Paymaster sponsorship for compatible Coinbase Smart Wallet/Base Account connections. If the connected wallet does not support <Code>wallet_sendCalls</Code>, it falls back to the standard wallet transaction path, which requires the payer wallet to hold Base ETH for gas.</p>
        </SubSection>
        <SubSection title="Circle Smart Wallet">
          <p>The Circle email smart-wallet path abstracts gas for Base payments. The payer funds the Circle smart wallet with USDC and confirms the payment without needing Base ETH. A configured USDC recovery amount can be routed internally to treasury to offset sponsored gas economics.</p>
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
        <p>For Solana Circle Smart Wallet and connected-wallet payments, the payer signs the USDC transfer while the Hash PayLink Solana relayer is the fee payer. The payer needs USDC only; the relayer pays SOL network fees and any one-time ATA rent for missing recipient or treasury token accounts.</p>
        <SubSection title="Circle Smart Wallet on Solana">
          <p>Circle provides the smart-wallet signing UX. Hash PayLink builds the transaction with the relayer as fee payer, Circle signs it, and Hash PayLink relays it. Recipient and treasury ATAs are not temporary, so they are not closed after direct payments; once they exist, future payments to the same addresses are cheaper.</p>
        </SubSection>
        <SubSection title="Send via Address on Solana">
          <p>Each payment link generates a deterministic vault address. The payer sends USDC to the vault from any wallet or exchange. The relayer polls for deposits, sweeps the balance to the recipient's ATA, routes the platform fee and configured recovery to treasury, and closes the temporary vault ATA to recover rent.</p>
        </SubSection>
        <SubSection title="Compatible wallets">
          <p>Phantom and Solflare are supported. The Solana recipient address is a base58-encoded public key.</p>
        </SubSection>
      </Section>

      <Section title="Arbitrum">
        <p>Arbitrum support uses Circle native USDC on Arbitrum One. Connected-wallet payments use a permit signature and Hash PayLink relayer submission, so the relayer pays ETH gas. Circle Paymaster is configured for the Arbitrum Circle Smart Wallet path, and Send via Address uses the Arbitrum ghost vault and relayer sweep path.</p>
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
