import { DocPage, DocHeader, Section, SubSection, CodeBlock, Table, NavFooter } from './components'

export default function ApiReference() {
  return (
    <DocPage>
      <DocHeader
        title="API Endpoints"
        description="Current public API reference for the Render-hosted Hash PayLink platform."
      />

      <Section title="Hosted Checkout API">
        <p>
          Create a human-checkout or agentic-x402 project in the Privy-authenticated developer dashboard. The selected payment path is immutable and every key issued by that project inherits it. Hash PayLink also pins the platform name, supported networks, receiving wallets and allowed return origins before issuing a server key. Partners remain responsible for fulfillment after checking the authoritative payment status.
        </p>
        <SubSection title="Request access">
          <p>Open the <a href="/developers" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">developer dashboard</a>, sign in with Privy and configure checkout routing. USDC settlement accepts a valid receiving address for every enabled network. Naira settlement requires a Paycrest-verified Nigerian bank account and a valid Base USDC refund address.</p>
        </SubSection>
        <SubSection title="Hosted flow">
          <CodeBlock lang="text">{`Create checkout → Open hosted URL → Slide to pay → Verify status and receipt`}</CodeBlock>
          <p>The shared checkout surface is used across Hash PayLink products. USDC projects choose the networks they accept and the payer chooses one at checkout. Naira settlement is currently fixed-amount and Base-only: the payer sends the exact quoted Base USDC amount, then the bank settlement is processed.</p>
        </SubSection>
        <SubSection title="POST /api/v2/checkouts">
          <p>Creates an immutable, expiring USDC or paid-service checkout. Private-beta credentials and an idempotency key are required.</p>
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/checkouts \\
  -H "X-API-Key: YOUR_SERVER_KEY" \\
  -H "Idempotency-Key: order:your-unique-order-id" \\
  -H "Content-Type: application/json" \\
  -d '{
    "kind": "service",
    "checkoutMode": "human",
    "title": "Data request",
    "amount": "0.024",
    "memo": "Order 1042",
    "returnUrl": "https://your-allowlisted-domain.example/complete"
  }'`}</CodeBlock>
          <p>The request <code>checkoutMode</code> must match the API key's immutable project mode. A human project can offer every enabled network; the payer selects one and that payment attempt is then locked to the matching network and recipient. An agentic project selects one exact network when each checkout is created and returns an agentic <code>checkoutUrl</code> plus its Circle Gateway x402 <code>agentPaymentUrl</code>; it never returns a human fallback. The response also includes a durable <code>paymentAttemptId</code>. Test keys route to Arc Testnet; live keys use the configured Base and Arbitrum routes. Recipient overrides are rejected. API keys stay server-side.</p>
        </SubSection>
        <SubSection title="Agent wallet path">
          <p>Create the checkout with <code>checkoutMode: "agentic"</code> and either <code>agenticType: "creator_earnings"</code> or <code>agenticType: "agent_treasury"</code>. Open <code>checkoutUrl</code> for the hosted Circle Agent Wallet payer flow: email identity, wallet restoration or creation, USDC and App Pay balances, Gateway funding, and payment all stay inside checkout. Autonomous agents can instead send a GET request to <code>agentPaymentUrl</code>. Its first response is HTTP 402 with a standard <code>PAYMENT-REQUIRED</code> challenge. After Gateway verification and settlement, Hash PayLink returns the checkout id, payment-attempt id, and authoritative paid state used by signed webhooks.</p>
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/checkouts \
  -H "X-API-Key: YOUR_SERVER_KEY" \
  -H "Idempotency-Key: agent:your-unique-request-id" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "service",
    "checkoutMode": "agentic",
    "agenticType": "agent_treasury",
    "network": "base",
    "title": "LP Scout",
    "amount": "0.01",
    "returnUrl": "https://your-allowlisted-domain.example/complete"
  }'`}</CodeBlock>
          <CodeBlock lang="text">{`Create agentic service checkout
  -> checkoutUrl       (hosted Circle Agent Wallet checkout + durable success UI)
  -> agentPaymentUrl   (autonomous agent handles x402 challenge)
  -> paymentAttemptId  (immutable payment session)
  -> status + signed webhook confirm fulfillment`}</CodeBlock>
          <p>Agentic payment is available only from an agentic-x402 project and only for fixed-price USDC service checkouts. Every agentic checkout selects exactly one network at creation: use <code>arc</code> with a test key, or <code>base</code>/<code>arbitrum</code> with a live key. If a project key exposes more than one eligible network, omitting <code>network</code> is rejected instead of silently selecting a route. Flexible requests, Polymarket funding and local-bank settlement require a separate human-checkout project.</p>
        </SubSection>
        <SubSection title="GET /api/v2/checkouts?purpose=status&amp;id=chk_...">
          <p>Returns the authoritative <code>pending</code>, <code>processing</code>, <code>paid</code>, or <code>expired</code> state, including the network paid. For Naira settlement, <code>processing</code> means the USDC deposit is confirmed but bank delivery is not final. Verify <code>paid</code> from your server before fulfillment.</p>
          <CodeBlock lang="bash">{`curl "https://app.hashpaylink.com/api/v2/checkouts?purpose=status&id=chk_..." \\
  -H "X-API-Key: YOUR_SERVER_KEY"`}</CodeBlock>
        </SubSection>
        <SubSection title="Signed webhooks">
          <p>Configured projects receive <code>checkout.created</code>, <code>payment.processing</code>, <code>payment.confirmed</code>, and <code>payment.failed</code> events. Verify <code>X-HashPayLink-Signature</code>, formatted as <code>t=UNIX_SECONDS,v1=HMAC</code>. Compute HMAC-SHA256 over <code>timestamp + "." + rawRequestBody</code> with the webhook signing secret. Reject old timestamps and duplicate event ids.</p>
        </SubSection>
      </Section>

      <Section title="Arc Agreements API · Arc Testnet private pilot">
        <p>
          Enable <code>Arc Agreements</code> on a test project to create durable fixed, progressive, or milestone USDC terms on Arc Testnet. Creation returns a private payer-review path once. Funding and lifecycle execution remain invite-only: the project must pass Hash PayLink's pilot authorization, limits, operator, and runtime gates before a payer can activate an escrow.
        </p>
        <SubSection title="POST /api/v2/agreements">
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/agreements \
  -H "X-API-Key: YOUR_TEST_SERVER_KEY" \
  -H "Idempotency-Key: agreement:your-unique-order-id" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "fixed_unlock",
    "externalId": "order-1042",
    "resourceId": "content:premium-report",
    "title": "Premium report access",
    "description": "Unlock one premium research report.",
    "amount": "10",
    "payerEmail": "customer@example.com",
    "recipient": "0xARC_RECIPIENT",
    "durationSeconds": 86400,
    "cancellationWindowSeconds": 900
  }'`}</CodeBlock>
          <p>Human agreements require the customer&apos;s verified email. Only that authenticated email can review, connect an Arc wallet, and fund the private agreement. Progressive checkpoints must increase and end at 100 percent. Milestone percentages must total 100. Timing defaults to 24 hours with a 15-minute payer cancellation window. The response includes a masked payer email, domain-separated <code>termsHash</code>, project-scoped <code>clientReference</code>, normalized onchain schedule, one-time <code>payerReviewPath</code>, and <code>activationStatus: "private_pilot"</code>. Creating a draft never proves that funds moved.</p>
        </SubSection>
        <SubSection title="GET /api/v2/agreements">
          <p>Lists the project&apos;s agreements with their authoritative Arc lifecycle, confirmed chain totals, current payer-review request, and unified terminal receipt when confirmation data is complete. Add <code>?id=agr_...</code> to read one agreement, <code>?ids=agr_...,agr_...</code> to read up to 100 known project agreements, or <code>?limit=50</code> to bound the newest-first list. Internal request hashes, evidence hashes, prepared operator calls, and payer-access hashes are never returned.</p>
        </SubSection>
        <SubSection title="Rotate an unused payer link">
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/agreements \
  -H "X-API-Key: YOUR_TEST_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"rotate_payer_link","agreementId":"agr_..."}'`}</CodeBlock>
          <p>The prior private link is invalidated and a new one is returned. Rotation is rejected as soon as agreement activation has started. Keep this server-side; never place the project API key in browser code.</p>
        </SubSection>
        <SubSection title="Request payer review for a release">
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/agreements \
  -H "X-API-Key: YOUR_TEST_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "request_release",
    "agreementId": "agr_...",
    "deliveryNote": "Completed the agreed delivery.",
    "evidenceReference": "https://yourplatform.com/deliveries/1042"
  }'`}</CodeBlock>
          <p>Hash PayLink verifies project ownership, reconciles the confirmed Arc escrow, derives the next release step, and creates a payer-reviewed release request. This does not release USDC by itself. Repeating the request returns the existing pending review instead of creating a second action.</p>
        </SubSection>
        <SubSection title="Agreement webhooks">
          <p>Authorized pilot projects receive <code>agreement.activated</code>, <code>agreement.step_released</code>, <code>agreement.completed</code>, <code>agreement.cancelled</code>, and <code>agreement.refunded</code>. Each signed event is derived from an exactly reconciled snapshot at a confirmed Arc block. Draft creation alone emits no lifecycle event and must never trigger fulfillment.</p>
        </SubSection>
      </Section>

      <Section title="Polymarket Funding API">
        <p>
          Enable <code>Polymarket funding</code> on a human-checkout USDC project. Your server supplies the customer's Polymarket wallet, amount and eligible project networks. Hash PayLink independently requests and verifies the provider deposit route; integrations cannot supply or override that destination.
        </p>
        <SubSection title="POST /api/v2/funding/polymarket/checkouts">
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/funding/polymarket/checkouts \
  -H "X-API-Key: YOUR_SERVER_KEY" \
  -H "Idempotency-Key: funding:your-unique-request-id" \
  -H "Content-Type: application/json" \
  -d '{
    "polymarketWallet": "0xCUSTOMER_WALLET",
    "amount": "25",
    "networks": ["base", "arbitrum"],
    "returnUrl": "https://your-allowlisted-domain.example/funding/complete"
  }'`}</CodeBlock>
          <p>The response includes a hosted <code>checkoutUrl</code>, stable <code>fundingRequestId</code>, and authenticated <code>statusUrl</code>. The payer can select from the requested networks that are also enabled on the developer project. Base and Arbitrum are supported in this provider flow.</p>
        </SubSection>
        <SubSection title="GET /api/v2/funding/polymarket/checkouts?id=pmf_...">
          <p>Poll this endpoint from your server with the same API key. <code>awaiting_payment</code> means no accepted checkout payment, <code>bridging</code> means payment was received but provider delivery is not final, and <code>funded</code> means the provider reports completed delivery. Only <code>funded</code> returns the receipt and allowlisted return URL. Never grant access or credit a customer from the generic <code>payment.confirmed</code> webhook alone for a provider-funded checkout.</p>
        </SubSection>
      </Section>

      <Section title="0G verification">
        <SubSection title="GET /api/agent-verify">
          <p>Verifies archived payment proofs against the 0G proof layer.</p>
          <CodeBlock lang="bash">{`GET /api/agent-verify?eventId=YOUR_EVENT_ID&payer=Alice`}</CodeBlock>
        </SubSection>
        <SubSection title="POST /api/agent-ask">
          <p>Payment-gated assistant endpoint. Verifies access before returning the AI response.</p>
        </SubSection>
      </Section>

      <Section title="Payment and dashboard">
        <SubSection title="POST /api/event-register">
          <p>Registers a confirmed payment to a dashboard and can trigger 0G archiving.</p>
        </SubSection>
        <SubSection title="GET /api/list-event-payments">
          <p>Returns registered payments for a multi-payer event dashboard.</p>
        </SubSection>
      </Section>

      <Section title="Solana relay">
        <SubSection title="POST /api/solana-build-tx">
          <p>Builds a Solana USDC transfer transaction with the Hash PayLink relayer as fee payer.</p>
        </SubSection>
        <SubSection title="POST /api/solana-relay">
          <p>Submits a payer-signed Solana transaction.</p>
        </SubSection>
      </Section>

      <Section title="Telegram and PolyDesk">
        <Table
          headers={['Endpoint', 'Purpose']}
          rows={[
            ['/api/telegram-request', 'Durable Telegram payment request state'],
            ['/api/polymarket-bridge', 'Polymarket funding bridge proxy with builder attribution'],
            ['/api/polymarket-portfolio', 'Postgres-backed PolyDesk profile, alert, watchlist, and funding state'],
            ['/api/worldcup-scores', 'World Cup live score and Polymarket market context'],
            ['/api/worldcup-news', 'World Cup market news feed'],
          ]}
        />
      </Section>

      <Section title="Legacy compatibility endpoints">
        <Table
          headers={['Endpoint', 'Purpose']}
          rows={[
            ['/api/privy-circle-link', 'Privy to Circle wallet mapping'],
            ['/api/stream-create', 'Legacy timed-stream compatibility'],
            ['/api/stream-status', 'Legacy timed-stream state'],
            ['/api/arena-room', 'Experimental Arena test-room state; not a public Arc Agreements API'],
          ]}
        />
      </Section>

      <NavFooter
        prev={{ label: 'SDK', path: '/docs/sdk' }}
        next={{ label: 'Environment', path: '/docs/environment' }}
      />
    </DocPage>
  )
}
