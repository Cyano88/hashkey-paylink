import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, CodeBlock, NavFooter } from './components'

export default function PaymentLinks() {
  return (
    <DocPage>
      <DocHeader
        title="Payment Links"
        description="Everything about creating, sharing, and managing Hash PayLink payment links — single-payer, multi-payer, flexible amount, QR codes, and FX display."
      />

      <Section title="Single-payer links">
        <p>A standard payment link is a URL with your recipient address, amount, and optional memo encoded as query params. Share it as a link or QR code. The payer opens it, connects a wallet or uses Send via Address, and pays.</p>
        <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xYourAddress&a=25&m=Invoice+042`}</CodeBlock>
        <p className="mt-2">The 0.2% platform fee is deducted atomically in the transaction. Gas-sponsored EVM payments may also route a small configured recovery amount to treasury. The payer sees the exact amount they'll send before signing.</p>
      </Section>

      <Section title="Multi-payer collection">
        <p>Multi-payer collection turns a single link into a group payment hub. Enable it by adding <Code>v=1&id=YOUR_EVENT_ID</Code> to the URL or toggling the option on the create page.</p>
        <SubSection title="How it works">
          <p>Each payer enters their name before paying. The organizer gets a live dashboard at <Code>/event?id=YOUR_EVENT_ID</Code> showing every payment in real time — payer name, amount, chain, timestamp, and 0G archive status.</p>
        </SubSection>
        <SubSection title="0G archiving">
          <p>Every confirmed payment in multi-payer mode is automatically archived to 0G decentralized storage. The <Code>0G</Code> badge next to each row starts grey (archiving) and turns blue/purple when the proof is anchored on-chain. This is what powers the Agent Verification API.</p>
        </SubSection>
        <SubSection title="Dashboard features">
          <ul className="list-none space-y-1">
            <li>• Auto-refreshes every 5 seconds</li>
            <li>• CSV export of full payment log</li>
            <li>• Live FX conversion display (optional)</li>
            <li>• Footer shows total archived count (e.g. 5/5 archived)</li>
            <li>• 0G Labs link to view all payments on-chain</li>
          </ul>
        </SubSection>
        <InfoBox type="info">Multi-payer collection is required for 0G archiving and Agent Verification. Single-payer links do not trigger archiving.</InfoBox>
      </Section>

      <Section title="Flexible amount">
        <p>Enable flexible amount by adding <Code>f=1</Code> to the URL or toggling the option on the create page. The payer enters any amount they choose before paying. Useful for tips, donations, restaurants, or pay-what-you-want pricing.</p>
        <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xYourAddress&f=1&m=Tip+Jar`}</CodeBlock>
      </Section>

      <Section title="QR codes">
        <p>Every link generates a 1024×1024px QR code automatically. Download it from the link creation page and print it, display it on a screen, or embed it in materials.</p>
        <p className="mt-2">Businesses can request custom branded QR codes with their logo. Email <a href="mailto:support@hashpaylink.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@hashpaylink.com</a>.</p>
      </Section>

      <Section title="Local currency FX display">
        <p>Show the USDC amount alongside a local currency equivalent using the <Code>fx</Code> URL parameter. Supported currencies: NGN, GHS, KES, SGD.</p>
        <CodeBlock lang="url">{`https://hashpaylink.com/pay?e=0xYour...&a=10&v=1&id=event-1&fx=NGN&fs=1`}</CodeBlock>
        <p className="mt-2">Rates are fetched live from Fixer.io (requires <Code>FIXER_API_KEY</Code> env var) and cached for 10 minutes. A custom rate can be passed directly with <Code>xr=1500</Code>.</p>
      </Section>

      <Section title="Underpayment detection">
        <p>If a payer sends less than the requested amount, the success screen flags it precisely:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• <strong className="text-gray-800 dark:text-gray-200">Partial payment (50–99%):</strong> Amber warning with exact shortfall shown</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Underpayment (&lt;50%):</strong> Red warning with shortfall and total received</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Overpayment (&gt;100.1%):</strong> Amber notice — overpayment is processed, excess goes to recipient</li>
        </ul>
        <p className="mt-2">Actual received amount is read from the on-chain Transfer event, not from the payer's input.</p>
      </Section>

      <Section title="Dark mode">
        <p>Hash PayLink supports full light/dark theme toggle with preference stored in <Code>localStorage</Code> under the key <Code>hp_theme</Code>. The theme also respects the system preference on first load.</p>
      </Section>

      <Section title="Hash Assistant">
        <p>The Hash Assistant is a built-in support chatbot available on every page via the chat bubble in the bottom-right corner. It can:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• Track a transaction hash in real time — paste any <Code>0x...</Code> hash</li>
          <li>• Answer questions about payment flows, chains, fees, and wallets</li>
          <li>• Detect and warn about phishing attempts</li>
          <li>• Provide official support contact details</li>
        </ul>
        <p className="mt-2">Transaction lookup is powered by the <Code>/api/tx-status</Code> endpoint which queries supported chains for the hash or address.</p>
      </Section>

      <NavFooter
        prev={{ label: 'Getting Started', path: '/docs/getting-started' }}
        next={{ label: 'Chains', path: '/docs/chains/base' }}
      />
    </DocPage>
  )
}
