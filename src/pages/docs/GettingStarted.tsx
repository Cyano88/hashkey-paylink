import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, NavFooter } from './components'

export default function GettingStarted() {
  return (
    <DocPage>
      <DocHeader
        title="Getting Started"
        description="Create and share a payment link in under a minute. No account, no backend, no gas tokens required."
      />

      <Section title="1. Create a payment link">
        <p>Go to <a href="https://hashpaylink.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">hashpaylink.com</a> and fill in three fields:</p>
        <ul className="list-none space-y-2 mt-2">
          <li>• <strong className="text-gray-800 dark:text-gray-200">Recipient address</strong> — your EVM, Starknet, or Solana wallet address</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Amount</strong> — fixed USDC amount, or enable Flexible Amount so payers choose</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Memo</strong> (optional) — invoice number, event name, or any label</li>
        </ul>
        <p className="mt-2">Click <strong className="text-gray-800 dark:text-gray-200">Generate Link</strong> and your payment URL is ready instantly.</p>
      </Section>

      <Section title="2. Share the link or QR code">
        <p>Every generated link also produces a downloadable 1024×1024px QR code. Share the URL via message, email, or display the QR at a physical location.</p>
        <p>The link works on any device — no app download, no wallet pre-installed on payer's end to use the Send via Address mode.</p>
      </Section>

      <Section title="3. Payer completes checkout">
        <p>Payers who open the link can pay in two ways:</p>
        <SubSection title="Connect Wallet">
          <p>Connect MetaMask, Coinbase Wallet, Phantom, ArgentX, or any supported wallet. Hash PayLink handles chain switching automatically. The payer signs one transaction — no manual gas estimation needed.</p>
        </SubSection>
        <SubSection title="Send via Address (no wallet connection)">
          <p>For payers sending from a CEX (Binance, Coinbase, Bybit) or hardware wallet, the payment page shows a deterministic vault address. The payer sends the exact USDC amount to that address. Payment is detected on-chain automatically within seconds.</p>
          <InfoBox type="tip">Send via Address uses CREATE2 ghost vaults — the vault address is computed deterministically, no deployment required. Funds are swept to the recipient atomically.</InfoBox>
        </SubSection>
      </Section>

      <Section title="4. Payment confirms">
        <p>Payment detection happens via chain-specific polling — typically within 2–3 seconds of on-chain confirmation. The payer sees a success card showing:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• Exact amount received after the 0.2% platform fee</li>
          <li>• Transaction hash with explorer link</li>
          <li>• Underpayment or overpayment notice if applicable</li>
        </ul>
      </Section>

      <Section title="Multi-payer collection (events)">
        <p>Enable <strong className="text-gray-800 dark:text-gray-200">Multi-Payer Collection</strong> when creating a link to collect from many people at once. Each payer enters their name before paying. The organizer gets a live dashboard showing every payment in real time.</p>
        <p>Every payment in this mode is automatically archived to 0G decentralized storage — creating permanent, verifiable proofs used by the Agent Verification API.</p>
        <InfoBox type="info">Multi-Payer Collection is required for 0G Storage archiving and Agent Verification to work. Single payment links do not trigger archiving.</InfoBox>
      </Section>

      <Section title="URL structure">
        <p>A Hash PayLink URL encodes all payment parameters directly:</p>
        <CodeBlock lang="url">{`https://hashpaylink.com/pay?evm=0xABC...&amt=25&memo=Invoice%20042&event=1&id=my-event`}</CodeBlock>
        <p className="mt-2">Key parameters:</p>
        <ul className="list-none space-y-1 mt-1 font-mono text-xs">
          <li><Code>evm</Code> — EVM recipient address</li>
          <li><Code>sol</Code> — Solana recipient address</li>
          <li><Code>stark</Code> — Starknet recipient address</li>
          <li><Code>amt</Code> — USDC amount (omit for flexible)</li>
          <li><Code>memo</Code> — payment memo</li>
          <li><Code>event=1</Code> — enables multi-payer collection mode</li>
          <li><Code>id</Code> — event ID for the organizer dashboard</li>
          <li><Code>flex=1</Code> — enables flexible amount mode</li>
          <li><Code>net</Code> — lock to a specific chain (base, hashkey, arc, starknet, solana, arbitrum)</li>
        </ul>
      </Section>

      <NavFooter
        prev={{ label: 'Overview', path: '/docs' }}
        next={{ label: 'Payment Links', path: '/docs/payment-links' }}
      />
    </DocPage>
  )
}
