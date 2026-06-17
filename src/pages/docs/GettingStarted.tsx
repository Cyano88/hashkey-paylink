import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, NavFooter } from './components'

export default function GettingStarted() {
  return (
    <DocPage>
      <DocHeader
        title="Getting Started"
        description="Create and share a USDC payment link in under a minute."
      />

      <Section title="1. Open the app">
        <p>Use <a href="https://hashpaylink.com/app" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">hashpaylink.com/app</a> to create payment links, retail POS QR codes, PolyDesk routes, StreamPay access, and agent payment actions.</p>
      </Section>

      <Section title="2. Create a payment link">
        <p>Fill in the payment basics:</p>
        <ul className="list-none space-y-2 mt-2">
          <li>- <strong className="text-gray-800 dark:text-gray-200">Recipient</strong>: EVM wallet address, Solana wallet address, or supported email wallet path.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Amount</strong>: fixed USDC amount, or let the payer enter an amount.</li>
          <li>- <strong className="text-gray-800 dark:text-gray-200">Memo</strong>: optional invoice, event, split, or payment note.</li>
        </ul>
      </Section>

      <Section title="3. Share the link or QR">
        <p>Hash PayLink generates a hosted checkout URL and QR code. Share it in Telegram, WhatsApp, email, a storefront, or any channel where the payer already coordinates.</p>
      </Section>

      <Section title="4. Payer completes checkout">
        <SubSection title="Wallet or email wallet">
          <p>Payers can use supported connected wallets or Circle email wallet flows where available.</p>
        </SubSection>
        <SubSection title="Send via Address">
          <p>For payers using an exchange, hardware wallet, or non-browser wallet, Hash PayLink can show a deterministic payment address. The payer sends the exact USDC amount and the payment is detected on-chain.</p>
          <InfoBox type="tip">Send via Address keeps the payer experience simple: no browser extension is required for supported flows.</InfoBox>
        </SubSection>
      </Section>

      <Section title="5. Track and archive">
        <p>Multi-payer dashboards track payer names, receipts, and settlement state. Eligible proofs can be archived through 0G Storage for durable verification.</p>
      </Section>

      <Section title="URL structure">
        <p>A Hash PayLink URL encodes payment parameters directly:</p>
        <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xABC...&a=25&m=Invoice%20042&v=1&id=my-event`}</CodeBlock>
        <p className="mt-2">Common parameters:</p>
        <ul className="list-none space-y-1 mt-1 font-mono text-xs">
          <li><Code>e</Code> - EVM recipient address</li>
          <li><Code>s</Code> - Solana recipient address</li>
          <li><Code>a</Code> - USDC amount</li>
          <li><Code>m</Code> - payment memo</li>
          <li><Code>v=1</Code> - multi-payer collection mode</li>
          <li><Code>id</Code> - event ID for the organizer dashboard</li>
          <li><Code>f=1</Code> - flexible amount mode</li>
          <li><Code>n</Code> - lock to base, arbitrum, arc, or solana</li>
        </ul>
      </Section>

      <NavFooter
        prev={{ label: 'Overview', path: '/docs' }}
        next={{ label: 'Payment Links', path: '/docs/payment-links' }}
      />
    </DocPage>
  )
}
