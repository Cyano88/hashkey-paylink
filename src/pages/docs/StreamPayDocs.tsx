import { DocPage, DocHeader, Section, SubSection, Code, Table, InfoBox, NavFooter } from './components'

export default function StreamPayDocs() {
  return (
    <DocPage>
      <DocHeader
        badge="HashpayStream"
        title="Protected USDC agreements on Arc"
        description="Create a fixed, progressive, or milestone agreement, send one private payer link, and release protected USDC only after delivery review."
      />

      <InfoBox type="tip">
        HashpayStream is the standalone proof of what developers can build with Hash PayLink&apos;s Arc Agreements API. Hash PayLink provides the infrastructure; HashpayStream provides the focused agreement experience.
      </InfoBox>

      <Section title="What HashpayStream does">
        <p>
          HashpayStream protects a USDC payment on Arc Testnet while two parties complete an agreed piece of work. The creator defines the delivery, amount, recipient, duration, cancellation window, and release structure. The payer reviews the exact terms, funds the escrow, and approves a release only after reviewing delivery evidence.
        </p>
        <p>
          The product is intentionally narrow: create an agreement, fund it, submit work, review delivery, release or return funds, and keep a durable receipt of the final outcome.
        </p>
      </Section>

      <Section title="Current private-pilot flow">
        <ol className="list-none space-y-3">
          {[
            ['1', 'Create terms', 'Choose one release, progressive release, or milestones and enter the delivery terms.'],
            ['2', 'Send the private link', 'The payer link carries a rotatable capability and should be shared only with the intended payer.'],
            ['3', 'Fund on Arc', 'A different authenticated payer reviews the terms and funds the Arc Testnet USDC escrow.'],
            ['4', 'Submit delivery', 'The recipient submits a short delivery note and an HTTPS evidence link for the current release.'],
            ['5', 'Review and release', 'The bound payer approves the current release or reports an issue.'],
            ['6', 'Close with proof', 'Completed, cancelled, and refunded agreements expose the shared Hash PayLink receipt actions.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">{num}</span>
              <div>
                <strong className="text-gray-800 dark:text-gray-200">{title}: </strong>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Agreement structures">
        <Table
          headers={['Structure', 'Best fit', 'Release behavior']}
          rows={[
            ['One release', 'A single deliverable or purchase', 'The full protected amount releases after payer approval.'],
            ['Progressive release', 'Work measured by completion progress', 'The agreed cumulative checkpoints release in order.'],
            ['Milestones', 'Named delivery stages', 'Each named percentage releases only after its own review.'],
          ]}
        />
      </Section>

      <Section title="Roles and controls">
        <Table
          headers={['Role', 'Authority']}
          rows={[
            ['Creator', 'Creates the terms, shares the payer link, submits delivery evidence, and requests the next release.'],
            ['Payer', 'Funds the escrow, reviews delivery, approves releases, reports issues, and uses eligible cancellation or refund actions.'],
            ['Hash PayLink', 'Validates project policy, prepares Circle wallet actions, reconciles confirmed Arc state, signs lifecycle webhooks, and generates terminal receipts.'],
            ['HashpayStream', 'Presents the creator dashboard and consumes authoritative agreement events. It does not replace Arc as the settlement record.'],
          ]}
        />
        <InfoBox type="warning">The agreement creator cannot fund or approve their own delivery. Payer authority is bound to the authenticated wallet that starts the agreement.</InfoBox>
      </Section>

      <Section title="Circle and Arc infrastructure">
        <Table
          headers={['Layer', 'Role']}
          rows={[
            ['Arc Testnet', 'Runs the agreement factory and per-agreement USDC escrow contracts.'],
            ['Circle wallets', 'Provides email-first payer wallet access and submitted Arc wallet operations.'],
            ['USDC', 'The only protected and released asset in the current pilot.'],
            ['Hash PayLink webhooks', 'Deliver signed agreement lifecycle events to the HashpayStream backend.'],
            ['Hash PayLink receipts', 'Provide one consistent terminal receipt for completion, cancellation, or refund.'],
          ]}
        />
      </Section>

      <Section title="Developer integration">
        <SubSection title="Project setup">
          <p>
            Create a human checkout project in the Hash PayLink developer portal, enable Arc Agreements, configure an Arc Testnet recipient and webhook, then create an Arc sandbox key. Project approval and stored limits control whether payer activation is available.
          </p>
        </SubSection>
        <SubSection title="Create an agreement">
          <p>
            A backend creates terms with <Code>POST /api/v2/agreements</Code> and sends the returned one-time <Code>payerReviewPath</Code> to the payer. API keys must remain server-side. Draft creation is not proof of funding.
          </p>
        </SubSection>
        <SubSection title="Fulfil from signed state">
          <p>
            Applications should update their product state from verified lifecycle events such as <Code>agreement.activated</Code>, <Code>agreement.step_released</Code>, <Code>agreement.completed</Code>, <Code>agreement.cancelled</Code>, and <Code>agreement.refunded</Code>. A browser redirect alone is not fulfillment authority.
          </p>
        </SubSection>
      </Section>

      <Section title="Product boundary">
        <Table
          headers={['Surface', 'Decision']}
          rows={[
            ['Arc Agreements', 'Primary HashpayStream product and the only first-level navigation surface.'],
            ['Creator content', 'Compatibility-only while existing posts, unlocks, earnings, and receipts are preserved.'],
            ['Payroll and timed streams', 'Legacy contract and recovery paths; not part of the agreements-first public product.'],
            ['x402 creator unlocks', 'Compatibility-only in HashpayStream. Agentic x402 remains a separate Hash PayLink API product.'],
            ['Arena', 'Separate experimental game product. It is not an Arc Agreements feature or a HashpayStream navigation surface.'],
          ]}
        />
      </Section>

      <Section title="Pilot status">
        <ul className="space-y-2">
          <li>- Arc Agreements currently uses Arc Testnet and test USDC.</li>
          <li>- Activation is limited by per-project approval and stored amount, volume, duration, and active-agreement ceilings.</li>
          <li>- Agreement state is reconciled from confirmed Arc snapshots before lifecycle events are emitted.</li>
          <li>- Public mainnet activation requires a completed contract and operational security review.</li>
          <li>- The standalone HashpayStream client still shares the current Hash PayLink runtime while public-API parity and deployment separation are completed.</li>
        </ul>
      </Section>

      <NavFooter
        prev={{ label: 'SDK', path: '/docs/sdk' }}
        next={{ label: 'Security', path: '/docs/security' }}
      />
    </DocPage>
  )
}
