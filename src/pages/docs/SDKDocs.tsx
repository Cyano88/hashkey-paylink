import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, Table, NavFooter } from './components'

export default function SDKDocs() {
  return (
    <DocPage>
      <DocHeader
        title="@hashpaylink/sdk"
        description="A thin helper for building hosted Hash PayLink checkout URLs and buttons."
      />

      <Section title="Positioning">
        <InfoBox type="info">The SDK does not ask integrators to install wallet providers, Wagmi, or third-party wallet UI kits. Wallet and session execution stay inside the hosted Hash PayLink checkout.</InfoBox>
      </Section>

      <Section title="Install">
        <CodeBlock lang="bash">{`npm install @hashpaylink/sdk`}</CodeBlock>
      </Section>

      <Section title="PayLinkButton">
        <CodeBlock lang="typescript">{`import { PayLinkButton } from '@hashpaylink/sdk'

<PayLinkButton
  recipientEVM="0xYourAddress"
  network="base"
  amount="25"
  memo="Invoice #042"
/>`}</CodeBlock>
      </Section>

      <Section title="Props">
        <Table
          headers={['Prop', 'Type', 'Description']}
          rows={[
            ['recipientEVM', 'string', 'EVM recipient address for Base, Arbitrum, or Arc'],
            ['recipientSolana', 'string', 'Solana recipient address'],
            ['network', 'string', 'base | arbitrum | solana | arc'],
            ['amount', 'string', 'Fixed USDC amount'],
            ['memo', 'string', 'Payment memo shown to the payer'],
            ['flexibleAmount', 'boolean', 'Let the payer enter the amount'],
            ['eventId', 'string', 'Optional multi-payer dashboard ID'],
          ]}
        />
      </Section>

      <Section title="URL helper">
        <CodeBlock lang="typescript">{`import { buildPayLinkUrl } from '@hashpaylink/sdk'

const url = buildPayLinkUrl({
  recipientEVM: '0xABC...',
  recipientSolana: 'BASE58...',
  amount: '10',
  memo: 'Invoice #042',
})`}</CodeBlock>
      </Section>

      <Section title="URL API">
        <SubSection title="Single payer">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xABC...&a=25&m=Invoice+042`}</CodeBlock>
        </SubSection>
        <SubSection title="Multi-chain">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xABC...&s=BASE58...&a=10&x=1`}</CodeBlock>
        </SubSection>
        <SubSection title="Flexible amount">
          <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xABC...&f=1&m=Tip+Jar`}</CodeBlock>
        </SubSection>
      </Section>

      <Section title="Parameters">
        <Table
          headers={['Parameter', 'Description']}
          rows={[
            ['e', 'EVM recipient address'],
            ['s', 'Solana recipient address'],
            ['a', 'Fixed USDC amount'],
            ['m', 'Payment memo'],
            ['f', '1 = flexible amount'],
            ['v', '1 = multi-payer collection'],
            ['id', 'Event ID for dashboard'],
            ['n', 'base | arbitrum | solana | arc'],
          ]}
        />
      </Section>

      <Section title="Helpers">
        <p>The SDK exports helpers for hosted URL construction and lightweight input validation.</p>
        <CodeBlock lang="typescript">{`import {
  buildPayLinkUrl,
  isValidEvmAddress,
  isLikelySolanaAddress,
  SUPPORTED_NETWORKS,
} from '@hashpaylink/sdk'`}</CodeBlock>
      </Section>

      <NavFooter
        prev={{ label: 'API Endpoints', path: '/docs/api' }}
        next={{ label: 'HashpayStream', path: '/docs/streampay' }}
      />
    </DocPage>
  )
}
