import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, Table, NavFooter } from './components'

export default function ApiReference() {
  return (
    <DocPage>
      <DocHeader
        title="API Endpoints"
        description="Complete reference for all Hash PayLink server-side API routes. All endpoints are hosted at hashpaylink.com."
      />

      <Section title="0G Verification">
        <SubSection title="GET /api/agent-verify">
          <p>Trustless payment verification. Queries the PayLinkArchive contract on 0G Mainnet — no Hash PayLink server state involved. No API key required.</p>
          <CodeBlock lang="bash">{`GET /api/agent-verify?eventId=YOUR_EVENT_ID&payer=Alice`}</CodeBlock>
          <Table
            headers={['Param', 'Type', 'Description']}
            rows={[
              ['eventId', 'string', 'The event ID from the payment link'],
              ['payer',   'string', 'The name the payer entered during payment (case-insensitive)'],
            ]}
          />
          <CodeBlock lang="json">{`// 200 — verified
{
  "verified": true,
  "payment": { "eventId": "...", "payer": "Alice", "chain": "Base", "amount": "10.00", "ts": 1746123456 },
  "proof":   { "ogTxHash": "0x...", "ogExplorer": "https://chainscan.0g.ai/tx/0x...", "rootHash": "0x...", "contract": "0x79a804...", "network": "0G Mainnet (Chain ID 16661)" }
}

// 402 — not verified
{ "verified": false, "error": "No verified payment found", "hint": "Payment may still be archiving (~30–60s after confirmation)" }`}</CodeBlock>
        </SubSection>

        <SubSection title="POST /api/agent-ask">
          <p>Payment-gated AI service. Verifies payment on 0G Mainnet, then responds to a question using the Claude AI. Returns 402 if payment not found.</p>
          <CodeBlock lang="bash">{`POST /api/agent-ask
Content-Type: application/json

{ "eventId": "your-event-id", "payer": "Alice", "question": "What is the capital of France?" }`}</CodeBlock>
          <CodeBlock lang="json">{`// 200 — answer with proof
{ "answer": "Paris.", "proof": { "ogTxHash": "0x...", "ogExplorer": "...", "network": "0G Mainnet (Chain ID 16661)" } }

// 402 — payment required
{ "error": "Payment required", "verified": false }`}</CodeBlock>
        </SubSection>
      </Section>

      <Section title="Event Registry">
        <SubSection title="POST /api/event-register">
          <p>Registers a confirmed payment to the organizer's event dashboard and triggers 0G archiving in the background.</p>
          <CodeBlock lang="json">{`POST /api/event-register
{ "eventId": "...", "txHash": "0x...", "chain": "base", "payer": "Alice", "amount": "10.00", "memo": "Workshop" }`}</CodeBlock>
        </SubSection>

        <SubSection title="GET /api/list-event-payments">
          <p>Returns all registered payments for an event ID. Used by the organizer dashboard.</p>
          <CodeBlock lang="bash">{`GET /api/list-event-payments?eventId=YOUR_EVENT_ID`}</CodeBlock>
          <CodeBlock lang="json">{`[
  { "payer": "Alice", "amount": "10.00", "chain": "base", "txHash": "0x...", "ts": 1746123456, "ogRootHash": "0x...", "ogTxHash": "0x..." }
]`}</CodeBlock>
        </SubSection>
      </Section>

      <Section title="EVM Relay">
        <SubSection title="POST /api/relay-v2">
          <p>Gasless relay for Base, Arc, HashKey, and Arbitrum. Executes EIP-2612 permit + Multicall3 transfer atomically, or sweeps a ghost vault. The payer covers negligible gas on the source chain.</p>
          <CodeBlock lang="json">{`POST /api/relay-v2
{ "chain": "base", "permit": { ... }, "transfer": { ... } }`}</CodeBlock>
        </SubSection>

        <SubSection title="POST /api/sweep">
          <p>Triggers immediate sweep of a ghost vault to the recipient. Used when a direct USDC send to the vault address is detected.</p>
        </SubSection>

        <SubSection title="GET /api/sweep-keeper">
          <p>Batch sweep endpoint for the cron keeper. Scans for unswept vault balances and settles them. Protected by <Code>CRON_SECRET</Code> environment variable.</p>
        </SubSection>
      </Section>

      <Section title="Starknet Relay">
        <SubSection title="POST /api/relay-starknet">
          <p>Gasless Starknet relay via AVNU Paymaster. Builds a SNIP-9 v2 typed data transaction, signs with the relayer key, and executes — paying all STRK fees on behalf of the payer.</p>
        </SubSection>

        <SubSection title="POST /api/starknet-balance">
          <p>Returns the USDC balance of a Starknet address. Used by the payment page for pre-flight checks.</p>
        </SubSection>

        <SubSection title="GET /api/setup-starknet-relayer">
          <p>Initializes the Starknet relayer account (deploys OZ Account if not yet deployed).</p>
        </SubSection>

        <SubSection title="POST /api/recover-starknet">
          <p>Recovers USDC from a Starknet ghost vault in edge cases.</p>
        </SubSection>
      </Section>

      <Section title="Solana Relay">
        <SubSection title="POST /api/solana-build-tx">
          <p>Builds a Solana USDC transfer transaction with the relayer keypair as the fee payer. Returns an unsigned transaction for the payer to sign.</p>
        </SubSection>

        <SubSection title="POST /api/solana-relay">
          <p>Submits a payer-signed Solana transaction to the network.</p>
        </SubSection>

        <SubSection title="GET /api/solana-vault">
          <p>Returns the deterministic vault ATA (Associated Token Account) for a given payment link. Used for Send via Address on Solana.</p>
        </SubSection>

        <SubSection title="POST /api/solana-sweep">
          <p>Checks the vault ATA balance and sweeps it to the recipient. Closes the ATA after sweep to recover rent (~0.002 SOL), keeping the relayer self-funded.</p>
        </SubSection>
      </Section>

      <Section title="Utilities">
        <SubSection title="POST /api/tx-status">
          <p>Looks up a transaction hash or wallet address across supported chains. Used by the Hash Assistant chatbot for real-time transaction tracking.</p>
          <CodeBlock lang="json">{`POST /api/tx-status
{ "input": "0xabc...def" }

// Response
{ "type": "tx_hash", "chain": "base", "status": "confirmed", "amount": "10.00", "explorerUrl": "..." }`}</CodeBlock>
        </SubSection>

        <SubSection title="GET /api/fx-rate">
          <p>Returns live FX rates for NGN, GHS, KES, SGD vs USDC using Fixer.io. Responses are cached for 10 minutes. Falls back to custom rates if Fixer.io is unavailable.</p>
          <CodeBlock lang="bash">{`GET /api/fx-rate?currencies=NGN,GHS`}</CodeBlock>
        </SubSection>

        <SubSection title="GET /api/health">
          <p>Liveness probe. Returns <Code>200 OK</Code> with a timestamp. Used by Render health checks.</p>
        </SubSection>
      </Section>

      <Section title="StreamPay endpoints">
        <Table
          headers={['Endpoint', 'Method', 'Purpose']}
          rows={[
            ['/api/relay-stream',   'POST', 'Gasless claim/cancel for StreamPay payroll vaults on Arc'],
            ['/api/settle-poa',     'POST', 'Proof-of-Attention settlement for creator revenue'],
            ['/api/store-content',  'POST', 'Store gated creator content'],
            ['/api/get-content',    'GET',  'Retrieve gated content after PoA verification'],
            ['/api/register-vault', 'POST', 'Register a viewer session signature'],
            ['/api/get-vault',      'GET',  'Fetch vault state for a viewer'],
            ['/api/list-viewers',   'GET',  'List all viewers for a content ID'],
          ]}
        />
        <InfoBox type="info">StreamPay endpoints are only active when the service is accessed on the streampay.xyz domain or with the ?app=streampay query param.</InfoBox>
      </Section>

      <NavFooter
        prev={{ label: 'Access Mode', path: '/docs/access-mode' }}
        next={{ label: 'SDK', path: '/docs/sdk' }}
      />
    </DocPage>
  )
}
