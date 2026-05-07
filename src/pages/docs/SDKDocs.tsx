import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, Table, NavFooter } from './components'

export default function SDKDocs() {
  return (
    <DocPage>
      <DocHeader
        title="@hashpaylink/sdk"
        description="Drop a payment button into any React app, or use the URL API with zero dependencies."
      />

      <Section title="Installation">
        <CodeBlock lang="bash">{`npm install @hashpaylink/sdk`}</CodeBlock>
        <InfoBox type="info">The SDK requires React 18+, wagmi v2, and viem v2 for inline mode. Hosted mode has zero dependencies.</InfoBox>
      </Section>

      <Section title="PayLinkButton">
        <p>The <Code>{'<PayLinkButton>'}</Code> component is the primary SDK export. It renders a payment button that opens the Hash PayLink checkout.</p>
        <CodeBlock lang="typescript">{`import { PayLinkButton } from '@hashpaylink/sdk'

<PayLinkButton
  recipientEVM="0xYourAddress"
  amount="25"
  memo="Invoice #042"
  onPaymentSuccess={({ txHash, chain }) => {
    console.log('Paid on', chain, txHash)
  }}
/>`}</CodeBlock>
      </Section>

      <Section title="Props reference">
        <Table
          headers={['Prop', 'Type', 'Required', 'Description']}
          rows={[
            ['recipientEVM',     'string',   'one of',  'EVM (Base / HashKey / Arc / Arbitrum) recipient address'],
            ['recipientStark',   'string',   'one of',  'Starknet recipient address (66 chars)'],
            ['recipientSolana',  'string',   'one of',  'Solana recipient address (base58)'],
            ['amount',           'string',   'no',      'Fixed USDC amount. Omit to enable flexible amount.'],
            ['memo',             'string',   'no',      'Payment memo shown to payer'],
            ['flex',             'boolean',  'no',      'Allow payer to enter any amount'],
            ['multiChain',       'boolean',  'no',      'Show all chain options simultaneously'],
            ['platformFeeBps',   'number',   'no',      'Additional platform fee in basis points (20 bps default)'],
            ['hosted',           'boolean',  'no',      'true = opens in new tab (default). false = inline widget.'],
            ['label',            'string',   'no',      'Custom button label text'],
            ['onPaymentSuccess', 'function', 'no',      'Callback: ({ txHash, chain }) => void'],
            ['onPaymentError',   'function', 'no',      'Callback: (error: Error) => void'],
          ]}
        />
      </Section>

      <Section title="Hosted mode (default)">
        <p>In hosted mode (default), clicking the button opens the Hash PayLink checkout in a new tab. Zero configuration needed beyond the recipient address.</p>
        <CodeBlock lang="typescript">{`<PayLinkButton
  recipientEVM="0xABC..."
  amount="10"
  memo="Premium Access"
/>
// Opens: https://hashpaylink.com/pay?evm=0xABC...&amt=10&memo=Premium+Access`}</CodeBlock>
      </Section>

      <Section title="Inline mode">
        <p>In inline mode, the checkout widget embeds directly in your page. Requires wagmi + RainbowKit provider setup.</p>
        <CodeBlock lang="typescript">{`import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { PayLinkButton } from '@hashpaylink/sdk'
import { config } from './wagmi'

function App() {
  return (
    <WagmiProvider config={config}>
      <RainbowKitProvider>
        <PayLinkButton
          recipientEVM="0xABC..."
          amount="10"
          hosted={false}
          onPaymentSuccess={({ txHash }) => console.log(txHash)}
        />
      </RainbowKitProvider>
    </WagmiProvider>
  )
}`}</CodeBlock>
      </Section>

      <Section title="URL API (no SDK required)">
        <p>Every Hash PayLink feature is accessible via direct URL construction — no npm package, no React, no installation.</p>

        <SubSection title="Single payer">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?evm=0xABC...&amt=25&memo=Invoice+042`}</CodeBlock>
        </SubSection>

        <SubSection title="Multi-chain link">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?evm=0xABC...&sol=BASE58...&stark=0x064...&amt=10`}</CodeBlock>
        </SubSection>

        <SubSection title="Multi-payer event">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?evm=0xABC...&amt=10&event=1&id=my-workshop-2025`}</CodeBlock>
        </SubSection>

        <SubSection title="Flexible amount">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?evm=0xABC...&flex=1&memo=Tip+Jar`}</CodeBlock>
        </SubSection>

        <SubSection title="Chain-locked">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?evm=0xABC...&amt=5&net=base`}</CodeBlock>
        </SubSection>
      </Section>

      <Section title="URL parameter reference">
        <Table
          headers={['Parameter', 'Description']}
          rows={[
            ['evm',     'EVM recipient address (Base / HashKey / Arc / Arbitrum)'],
            ['sol',     'Solana recipient address (base58)'],
            ['stark',   'Starknet recipient address'],
            ['amt',     'Fixed USDC amount. Omit for flexible.'],
            ['memo',    'URL-encoded payment memo'],
            ['flex',    '1 = flexible amount mode'],
            ['event',   '1 = multi-payer collection mode'],
            ['id',      'Event ID for multi-payer dashboard'],
            ['net',     'Lock to chain: base | hashkey | arc | starknet | solana | arbitrum'],
            ['fx',      'Show local currency FX: ngn | ghs | kes | sgd'],
            ['fxrate',  'Custom exchange rate if fx param is set'],
          ]}
        />
      </Section>

      <Section title="MULTICALL3_ADDRESS export">
        <p>The SDK exports the Multicall3 contract address used for atomic permit + transfer on EVM chains:</p>
        <CodeBlock lang="typescript">{`import { MULTICALL3_ADDRESS } from '@hashpaylink/sdk'
// '0xcA11bde05977b3631167028862bE2a173976CA11'`}</CodeBlock>
      </Section>

      <NavFooter
        prev={{ label: 'API Endpoints', path: '/docs/api' }}
        next={{ label: 'StreamPay', path: '/docs/streampay' }}
      />
    </DocPage>
  )
}
