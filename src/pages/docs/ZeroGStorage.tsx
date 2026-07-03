import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, Table, NavFooter } from './components'

export default function ZeroGStorage() {
  return (
    <DocPage>
      <DocHeader
        badge="0G Integration"
        title="0G Storage Integration"
        description="Every multi-payer payment is permanently archived to 0G decentralized storage and anchored on-chain via the PayLinkArchive smart contract — creating trustless, verifiable payment proofs."
      />

      <Section title="How it works">
        <p>When a payment confirms on a multi-payer collection link, Hash PayLink triggers a non-blocking archive flow:</p>
        <ol className="list-none space-y-3 mt-3">
          {[
            ['1', 'Serialize', 'The payment is serialized as a JSON record: event ID, payer name, chain, amount, tx hash, timestamp.'],
            ['2', 'Upload', 'The JSON is uploaded to 0G Storage via the 0G Indexer. A Merkle tree is built and the root hash (content address) is returned.'],
            ['3', 'Anchor', 'The root hash is anchored on-chain by calling the PayLinkArchive smart contract on 0G Mainnet (Chain ID 16661).'],
            ['4', 'Badge', 'The organizer dashboard shows a purple 0G badge next to the payment row — grey while archiving, blue/purple when confirmed.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-4">
              <span className="shrink-0 h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs font-bold flex items-center justify-center mt-0.5">{num}</span>
              <div>
                <strong className="text-gray-800 dark:text-gray-200">{title}: </strong>
                <span>{desc}</span>
              </div>
            </li>
          ))}
        </ol>
        <InfoBox type="tip">The archive is fire-and-forget — payment registration is never blocked by 0G. If the upload fails, the payment is still captured in the server registry and the badge stays grey.</InfoBox>
      </Section>

      <Section title="What 0G powers in Hash PayLink">
        <p>0G is the persistent proof layer behind the full Hash PayLink ecosystem. Payment chains handle settlement; 0G turns each settlement into agent-readable memory.</p>
        <Table
          headers={['Product surface', '0G role']}
          rows={[
            ['Multi-Payer Collection', 'Uploads every payer row as a content-addressed JSON record and anchors the root hash on 0G Mainnet.'],
            ['Organizer Dashboard', 'Shows live archive badges and links each payment to its 0G explorer proof.'],
            ['Access Mode', 'Lets AI agents, APIs, and gated apps verify payment with /api/agent-verify before serving content.'],
            ['Photon Telegram Agent', 'Creates paid AI requests in chat, then unlocks answers only after the 0G payment proof exists.'],
            ['Built-in AI Agent', 'POST /api/agent-ask reads PayLinkArchive on 0G Mainnet before returning an Anthropic-backed answer.'],
            ['HashpayStream and Creator PoA', 'Stream and attention settlement receipts are designed to use the same archive pattern as durable 0G records.'],
          ]}
        />
        <InfoBox type="info">The core primitive is reusable: USDC payment -&gt; 0G archive -&gt; on-chain root hash -&gt; agent verifies -&gt; service responds with proof.</InfoBox>
      </Section>

      <Section title="PayLinkArchive contract">
        <Table
          headers={['Property', 'Value']}
          rows={[
            ['Contract address', '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'],
            ['Network', '0G Mainnet'],
            ['Chain ID', '16661'],
            ['RPC', 'Server-side OG_RPC_URL when set, otherwise public 0G RPC fallback'],
            ['Indexer', 'Server-side OG_INDEXER_RPC_URL when set, otherwise public 0G indexer fallback'],
            ['Explorer', 'https://chainscan.0g.ai'],
          ]}
        />
        <p className="mt-4">The contract emits a <Code>PaymentArchived</Code> event for every archived payment:</p>
        <CodeBlock lang="solidity">{`event PaymentArchived(
  string indexed eventId,
  bytes32 indexed rootHash,
  string  chain,
  string  payer,
  string  amount,
  uint256 ts
);`}</CodeBlock>
        <p className="mt-3">The <Code>rootHash</Code> is the 0G Storage content address — use it to retrieve the original JSON blob from an authorized 0G node. The event is fully public and queryable by services with access to a 0G RPC.</p>
      </Section>

      <Section title="Organizer dashboard badges">
        <SubSection title="Grey badge">
          <p>The 0G badge appears grey immediately after payment registration. It means the archive upload is in progress (typically 5–30 seconds after payment confirms).</p>
        </SubSection>
        <SubSection title="Blue / purple badge">
          <p>Once the root hash is anchored on-chain, the badge turns blue/purple. Clicking it opens the transaction on <a href="https://chainscan.0g.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">chainscan.0g.ai</a> showing the full <Code>PaymentArchived</Code> event log.</p>
        </SubSection>
        <SubSection title="Footer counter">
          <p>The bottom of the dashboard shows a count like <Code>5/5 archived</Code> — the ratio of payments successfully archived to total payments in the event.</p>
        </SubSection>
        <SubSection title="0G Labs footer link">
          <p>Below the payment list, a link references all payments from the event documented on 0G Storage. Clicking it opens the PayLinkArchive contract on chainscan.0g.ai filtered by the event ID — a complete, public, permanent record.</p>
        </SubSection>
      </Section>

      <Section title="Agent Verification API">
        <p>The archived payments power a trustless verification API that AI agents can query to confirm payment without trusting any Hash PayLink server state.</p>
        <CodeBlock lang="bash">{`GET /api/agent-verify?eventId=YOUR_EVENT_ID&payer=Alice

# Response (verified)
{
  "verified": true,
  "payment": {
    "eventId": "your-event-id",
    "payer":   "Alice",
    "chain":   "Base",
    "amount":  "10.00",
    "ts":      1746123456
  },
  "proof": {
    "ogTxHash":   "0xabc...def",
    "ogExplorer": "https://chainscan.0g.ai/tx/0xabc...def",
    "rootHash":   "0x...",
    "contract":   "0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a",
    "network":    "0G Mainnet (Chain ID 16661)"
  }
}

# Response (not verified)
{
  "verified": false,
  "error":    "No verified payment found for this payer on 0G Storage",
  "hint":     "Payment may still be archiving (~30–60s after confirmation)"
}`}</CodeBlock>
        <InfoBox type="info">The endpoint reads directly from the PayLinkArchive contract on 0G Mainnet. It does not query Hash PayLink's database. This means the response is trustless — you can replace it with a direct contract query and get the same result.</InfoBox>
      </Section>

      <Section title="Direct contract query">
        <p>For maximum trustlessness, skip the API endpoint entirely and query the contract directly using any Ethereum library:</p>
        <CodeBlock lang="typescript">{`import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider(process.env.OG_RPC_URL)
const contract = new ethers.Contract(
  '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a',
  ['event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)'],
  provider
)

const events = await contract.queryFilter(
  contract.filters.PaymentArchived('your-event-id'),
  32498000, // deployment block
  'latest'
)

const match = events.find(e => e.args[3].toLowerCase() === 'alice')`}</CodeBlock>
        <p className="mt-2">Run this server-side. Hash PayLink prefers <Code>OG_RPC_URL</Code> when configured and temporarily falls back to the public 0G RPC while private provider access is pending.</p>
      </Section>

      <Section title="Payment-gated AI demo">
        <p>Visit <a href="https://hashpaylink.com/agent" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">hashpaylink.com/agent</a> to see a live demo of 0G-verified payment-gated AI. Enter an event ID and payer name — the system verifies on 0G Mainnet and unlocks an AI chat session. Each response carries a 0G proof badge.</p>
        <p className="mt-2">Demo credentials:</p>
        <CodeBlock lang="text">{`Event ID: test-0g-1778114523394
Payer:    HashPayLink 0G Test`}</CodeBlock>
      </Section>

      <Section title="0G APAC demo sequence">
        <p>For a short judging demo, show one complete proof loop end to end:</p>
        <ol className="list-none space-y-3 mt-3">
          {[
            ['1', 'Create collection', 'Create a multi-payer Hash PayLink and copy the event ID.'],
            ['2', 'Pay', 'Enter a payer name, complete a USDC payment, and return to the dashboard.'],
            ['3', 'Archive', 'Show the dashboard 0G badge changing from pending to archived.'],
            ['4', 'Inspect proof', 'Open the 0G explorer link for the PayLinkArchive transaction.'],
            ['5', 'Verify', 'Call /api/agent-verify with eventId and payer to return verified: true plus rootHash and ogTxHash.'],
            ['6', 'Unlock AI', 'Use /api/agent-ask or the Photon bot so the AI responds only after the 0G proof exists.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-4">
              <span className="shrink-0 h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs font-bold flex items-center justify-center mt-0.5">{num}</span>
              <div>
                <strong className="text-gray-800 dark:text-gray-200">{title}: </strong>
                <span>{desc}</span>
              </div>
            </li>
          ))}
        </ol>
        <InfoBox type="tip">Judging line: Hash PayLink turns any USDC payment into a permanent 0G-backed credential that AI agents can verify before acting.</InfoBox>
      </Section>

      <NavFooter
        prev={{ label: 'Chains', path: '/docs/chains/base' }}
        next={{ label: 'Access Mode', path: '/docs/access-mode' }}
      />
    </DocPage>
  )
}
