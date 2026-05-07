import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, NavFooter } from './components'

export default function AccessMode() {
  return (
    <DocPage>
      <DocHeader
        badge="For Developers"
        title="Access Mode"
        description="Gate any AI agent, API endpoint, or web service behind a verified USDC payment — no login system, no subscription database, no trust in centralized infrastructure."
      />

      <InfoBox type="warning">Access Mode is intended for developers who integrate the Hash PayLink verification API into their own service. A working Access link requires your destination URL to handle the verification params — a random URL pasted here will not provide access to paying users.</InfoBox>

      <Section title="How Access Mode works">
        <p>An agent owner (you, the developer) creates a multi-payer collection link in Access Mode. When a user pays:</p>
        <ol className="list-none space-y-3 mt-3">
          {[
            ['1', 'User pays', 'User opens your Access link, enters their name, and sends USDC via any supported chain.'],
            ['2', 'Archive', 'Payment is archived to 0G Storage. The root hash is anchored on-chain via PayLinkArchive.'],
            ['3', 'Access link', 'Success screen shows the user a pre-filled access link: your agent URL + their eventId and payer name as URL params.'],
            ['4', 'Your service verifies', 'User opens the link. Your service calls /api/agent-verify with the params. Gets back verified: true + on-chain proof.'],
            ['5', 'Access granted', 'Serve your AI response, gated content, or premium service. Attach the 0G proof as a receipt.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-4">
              <span className="shrink-0 h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">{num}</span>
              <div>
                <strong className="text-gray-800 dark:text-gray-200">{title}: </strong>
                <span>{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Integrating the verification API">
        <p>Add this to your agent or web service before serving gated content. Three lines is all it takes:</p>

        <SubSection title="Node.js / Express">
          <CodeBlock lang="typescript">{`app.get('/my-agent', async (req, res) => {
  const { eventId, payer } = req.query

  const { verified, proof } = await fetch(
    \`https://hashpaylink.com/api/agent-verify?eventId=\${eventId}&payer=\${payer}\`
  ).then(r => r.json())

  if (!verified) return res.status(402).json({ error: 'Payment required' })

  // Serve your AI response or gated content here
  res.json({ answer: 'Hello, verified user!', proof })
})`}</CodeBlock>
        </SubSection>

        <SubSection title="Python / FastAPI">
          <CodeBlock lang="python">{`import httpx
from fastapi import FastAPI, Query, HTTPException

app = FastAPI()

@app.get("/my-agent")
async def agent(eventId: str = Query(...), payer: str = Query(...)):
    r = await httpx.AsyncClient().get(
        f"https://hashpaylink.com/api/agent-verify",
        params={"eventId": eventId, "payer": payer}
    )
    data = r.json()
    if not data.get("verified"):
        raise HTTPException(402, "Payment required")

    return {"answer": "Hello, verified user!", "proof": data["proof"]}`}</CodeBlock>
        </SubSection>

        <SubSection title="Middleware (protect any route)">
          <CodeBlock lang="typescript">{`async function requirePayment(req, res, next) {
  const { eventId, payer } = req.query
  if (!eventId || !payer) return res.status(400).json({ error: 'Missing params' })

  const { verified } = await fetch(
    \`https://hashpaylink.com/api/agent-verify?eventId=\${eventId}&payer=\${payer}\`
  ).then(r => r.json())

  if (!verified) return res.status(402).json({ error: 'Payment required' })
  next()
}

// Protect any route
app.use('/premium', requirePayment)`}</CodeBlock>
        </SubSection>
      </Section>

      <Section title="Direct 0G query (zero dependency on Hash PayLink)">
        <p>For maximum trustlessness, verify against the 0G chain directly without calling Hash PayLink's API at all:</p>
        <CodeBlock lang="typescript">{`import { ethers } from 'ethers'

const ABI = ['event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)']

async function verifyOnChain(eventId: string, payer: string) {
  const provider = new ethers.JsonRpcProvider('https://evmrpc.0g.ai')
  const contract = new ethers.Contract('0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a', ABI, provider)

  const events = await contract.queryFilter(
    contract.filters.PaymentArchived(eventId),
    32498000,
    'latest'
  )

  return events.some(e => e.args[3].toLowerCase() === payer.toLowerCase())
}`}</CodeBlock>
        <InfoBox type="info">This approach requires no API key, no Hash PayLink server, and produces the same result. Use it when you want zero dependency on hashpaylink.com infrastructure.</InfoBox>
      </Section>

      <Section title="The access link format">
        <p>After payment, the user receives a pre-filled access link pointing to your agent URL:</p>
        <CodeBlock lang="url">{`https://youragent.com/chat?eventId=YOUR_EVENT_ID&payer=Alice`}</CodeBlock>
        <p className="mt-2">Your service reads these params, calls agent-verify, and serves the content. The user never manually types an event ID or payer name — it's all in the link they receive after paying.</p>
      </Section>

      <Section title="Use cases">
        <ul className="list-none space-y-2">
          <li>• <strong className="text-gray-800 dark:text-gray-200">AI tutoring:</strong> Students pay once via a course event link, then access the AI tutor indefinitely via their access link.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Premium APIs:</strong> Developers pay for API credits, receive a link, attach params to every request.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Gated content:</strong> Readers pay for newsletter access, get a link that unlocks full articles.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Event-based AI:</strong> Conference attendees pay registration, access the event AI assistant from their badge QR code.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Design/consulting:</strong> Client pays invoice, access link opens a project-specific AI briefing session.</li>
        </ul>
      </Section>

      <Section title="Getting your URL ready">
        <p>Before registering your URL in Access Mode, ensure it:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• Reads <Code>eventId</Code> and <Code>payer</Code> from query params</li>
          <li>• Calls <Code>GET /api/agent-verify</Code> with those params</li>
          <li>• Returns <Code>402</Code> when <Code>verified</Code> is false</li>
          <li>• Returns your content/response when <Code>verified</Code> is true</li>
        </ul>
        <p className="mt-3">Once integrated, paste your URL into the Access Mode create form. Hash PayLink will ping your endpoint with test params — if it returns a structured JSON response, you'll see a green compatibility check. If it returns HTML or errors, you'll see a compatibility warning.</p>
      </Section>

      <NavFooter
        prev={{ label: '0G Storage', path: '/docs/0g-storage' }}
        next={{ label: 'API Endpoints', path: '/docs/api' }}
      />
    </DocPage>
  )
}
