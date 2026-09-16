import { DocPage, DocHeader, Section, SubSection, InfoBox, Table, Code, NavFooter } from './components'

export default function Chains() {
  return (
    <DocPage>
      <DocHeader
        title="Supported Chains"
        description="Current public Hash PayLink flows focus on Circle USDC across Base, Arbitrum, Arc Mainnet, and Solana."
      />

      <Section title="Public chain overview">
        <Table
          headers={['Chain', 'Asset', 'Primary use', 'Chain ID']}
          rows={[
            ['Base', 'USDC', 'Payment links, Telegram checkout, PolyDesk funding, retail POS', '8453'],
            ['Arbitrum', 'USDC', 'Payment links, retail POS, and sponsored EVM checkout paths', '42161'],
            ['Arc Mainnet', 'USDC', 'Pocket bridging, Arc token swaps, and USDC payments', '5042'],
            ['Solana', 'USDC', 'Payment links and retail POS through the Solana relay path', 'mainnet-beta'],
          ]}
        />
        <InfoBox type="info">Legacy adapters may remain in the repository for compatibility, but this page documents only the product flows currently surfaced in the public app.</InfoBox>
      </Section>

      <Section title="Base">
        <SubSection title="Checkout modes">
          <p>Base supports the current Circle-aligned hosted checkout. Hash PayLink records settlement metadata and can archive eligible multi-payer proofs to 0G.</p>
        </SubSection>
        <InfoBox type="info">Base remains the default network for most hosted USDC checkout and PolyDesk funding flows.</InfoBox>
      </Section>

      <Section title="Arbitrum">
        <p>Arbitrum uses native USDC on Arbitrum One. Hash PayLink supports payment links, retail POS, and EVM relay paths for Arbitrum checkout.</p>
        <InfoBox type="warning">Use native Arbitrum USDC at <Code>0xaf88d065e77c8cC2239327C5EDb3A432268e5831</Code>. Do not send bridged USDC.e to Hash PayLink Arbitrum vaults.</InfoBox>
      </Section>

      <Section title="Arc Mainnet">
        <p>Arc mainnet supports USDC payments and Pocket token swaps where a liquidity route exists. Agreements require a separately verified mainnet escrow deployment before activation.</p>
        <Table
          headers={['Property', 'Value']}
          rows={[
            ['Chain ID', '5042'],
            ['RPC', 'https://rpc.mainnet.arc.io'],
            ['Explorer', 'https://explorer.arc.io'],
          ]}
        />
      </Section>

      <Section title="Solana">
        <p>Solana checkout uses USDC and a relay path where Hash PayLink can cover SOL transaction fees for supported flows. Recipient addresses are base58 Solana public keys.</p>
      </Section>

      <NavFooter
        prev={{ label: 'Payment Links', path: '/docs/payment-links' }}
        next={{ label: '0G Storage', path: '/docs/0g-storage' }}
      />
    </DocPage>
  )
}
