import { DocPage, DocHeader, Section, SubSection, Code, Table, InfoBox, NavFooter } from './components'

export default function StreamPayDocs() {
  return (
    <DocPage>
      <DocHeader
        badge="HashpayStream"
        title="HashpayStream"
        description="Creator checkout for USDC-paid content on Arc: unlock articles, books, private links, videos, and live routes with receipts, refunds, checkpoint payouts, and Agent Hash guidance."
      />

      <InfoBox type="tip">
        HashpayStream is the creator-focused product inside Hash PayLink. It is built for the Lepton thesis: make the smallest unit of creator content sellable, from one article to one reading checkpoint or watch checkpoint, settled in USDC on Arc.
      </InfoBox>

      <Section title="What HashpayStream is">
        <p>
          HashpayStream lets creators publish gated content and lets readers unlock access with USDC. The current product supports fixed x402 unlocks, pay-as-you-read checkpoints, a public HashWatch demo, creator earnings, receipts, reactions, comments, shareable gate links, and Agent Hash as a product-aware assistant.
        </p>
        <p>
          The launch surface is intentionally creator-first: readers discover content, unlock with a wallet-backed flow, consume the content, receive a receipt, and creators see earnings update from fixed unlocks or checkpoint releases.
        </p>
      </Section>

      <Section title="Judge test path">
        <ol className="list-none space-y-3">
          {[
            ['1', 'Open Discover', 'Browse paid posts, ebooks, HashWatch, World Cup news, and live-score route cards.'],
            ['2', 'Open a gate', 'Use a content card or shared gate link to reach the HashpayStream checkout.'],
            ['3', 'Unlock access', 'Use fixed x402 unlock for full access or pay-as-you-read when the content renders inside the reader.'],
            ['4', 'Watch checkpoint state', 'For checkpoint flows, released and refundable USDC update as progress milestones are reached.'],
            ['5', 'View receipt and earnings', 'Confirm the reader receipt and creator earnings state after unlock or checkpoint release.'],
            ['6', 'Ask Agent Hash', 'Ask how HashpayStream works, what payment modes exist, what content is latest, or to summarize unlocked content.'],
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

      <Section title="Core product flows">
        <SubSection title="Discover">
          <p>
            The Discover feed presents approved creator content and official drops across developer guides, ebooks, HashWatch, World Cup news, live scores, crypto, and creator posts. Cards carry stable content IDs and can route directly to the gate flow.
          </p>
        </SubSection>

        <SubSection title="Creator publishing">
          <p>
            Creators can publish article text, private links, or HashWatch videos with title, short description, category, author, social handle, price, and cover metadata. Approved posts appear in the creator library and can be shared externally.
          </p>
        </SubSection>

        <SubSection title="Fixed x402 unlock">
          <p>
            Fixed unlock is the simplest checkout path. A reader pays once with the x402/Gateway flow, receives access for the active reader wallet, and HashpayStream records the unlock and receipt state.
          </p>
        </SubSection>

        <SubSection title="Pay-as-you-read">
          <p>
            Pay-as-you-read lets a reader prepay the content price, then creator earnings release at reading checkpoints such as 25%, 50%, 75%, and 100%. Unread balance remains refundable until the reader consumes the content.
          </p>
        </SubSection>

        <SubSection title="HashWatch">
          <p>
            HashWatch is the video surface. The public launch path includes a free short demo for testing watch-based checkpoints, receipts, and refundable balance. Long video frame-by-frame analysis is not marketed as a live guarantee; longer media belongs on the async ZeroScout/0G compute path.
          </p>
        </SubSection>

        <SubSection title="Live scores and market-aware routes">
          <p>
            Live-score and sports route cards are shown only from verified app context. Agent Hash must not invent scores, odds, routes, or Polymarket context when verified data is unavailable.
          </p>
        </SubSection>
      </Section>

      <Section title="Payment modes">
        <Table
          headers={['Mode', 'What it does', 'Launch status']}
          rows={[
            ['Fixed x402 unlock', 'Reader pays once in USDC and keeps access for the verified reader wallet/session.', 'Primary public flow'],
            ['Pay-as-you-read', 'Reader prepays; creator earnings release as reading milestones are reached; unread balance stays refundable.', 'Primary public flow'],
            ['Pay-as-you-watch demo', 'Short HashWatch demo exercises watch checkpoints and receipt behavior without requiring a paid unlock.', 'Public demo path'],
            ['Timed streaming', 'Timed stream vault contracts remain available for stream settlement and recovery flows.', 'Kept narrow for public launch'],
            ['Live sports routes', 'Market-aware sports content cards can route users to unlockable context when verified data exists.', 'Visible with verified context only'],
          ]}
        />
      </Section>

      <Section title="Circle and Arc infrastructure">
        <p>
          HashpayStream uses Hash PayLink payment infrastructure with Arc as the settlement network for creator checkpoint flows and Circle-backed wallet sessions for simple reader and creator onboarding.
        </p>
        <Table
          headers={['Layer', 'Current role']}
          rows={[
            ['Arc Testnet', 'USDC settlement network for checkpoint escrow, stream vaults, receipts, and creator testing.'],
            ['Circle wallets', 'Email-first reader and creator wallet sessions for USDC access without forcing advanced wallet setup.'],
            ['x402 / Gateway', 'Fixed unlock checkout path for paid content and API-style access.'],
            ['USDC', 'Settlement asset for creator unlocks, reading checkpoint releases, refunds, and earnings.'],
            ['Hash PayLink receipts', 'Durable receipt layer for fixed unlocks, checkpoint releases, refunds, and creator settlement records.'],
          ]}
        />
      </Section>

      <Section title="Smart contracts">
        <Table
          headers={['Contract', 'Purpose', 'Network']}
          rows={[
            ['CheckpointVaultFactory', 'CREATE2 factory for pay-as-you-read checkpoint escrow vaults.', 'Arc Testnet'],
            ['CheckpointVault', 'Per-reader prepaid vault with milestone release and unread refund support.', 'Arc Testnet'],
            ['StreamVaultFactory', 'Timed stream factory retained for live/video meter flows and recovery paths.', 'Arc Testnet'],
            ['StreamVault', 'Per-recipient stream vault with claim and cancel support.', 'Arc Testnet'],
          ]}
        />
        <InfoBox type="warning">Public testing currently uses Arc Testnet contracts and test USDC. Production funds are not used in the Lepton demo flow.</InfoBox>
      </Section>

      <Section title="Receipt and proof state">
        <p>
          The product is built around extended receipt state. A user should be able to tell what was unlocked, what was released, what remains refundable, and which wallet or vault is tied to the action.
        </p>
        <Table
          headers={['Event', 'Receipt/proof state']}
          rows={[
            ['Fixed unlock', 'Content ID, reader wallet, creator wallet, amount, x402/Gateway receipt reference, access status.'],
            ['Checkpoint release', 'Content ID, checkpoint vault, reader wallet, creator wallet, released amount, progress milestone.'],
            ['Refund', 'Vault address, reader wallet, consumed amount, refunded amount, Arc transaction hash when available.'],
            ['Creator earnings', 'Fixed unlock total, reading/checkpoint total, creator wallet, and claim/recovery state.'],
            ['0G archive', 'Shown as proof when available, not as an endless progress promise. If archive proof is delayed, the app continues to show usable receipt state.'],
          ]}
        />
      </Section>

      <Section title="Agent Hash">
        <p>
          Agent Hash is the in-product HashpayStream assistant powered by ZeroScout. It is scoped to the creator and reader workflow: content discovery, payment modes, receipts, earnings, unlocked-content summaries, HashWatch, books, World Cup news, live scores, and creator publishing guidance.
        </p>
        <Table
          headers={['Request type', 'Expected behavior']}
          rows={[
            ['How to use HashpayStream', 'Return a concise guide covering Discover, unlocks, checkpoints, receipts, creator earnings, and Agent Hash.'],
            ['Latest HashWatch / latest book / top viewed', 'Answer from verified HashpayStream context and include clean gate/open links when available.'],
            ['Unlocked book or article summary', 'Use verified unlocked text or metadata; never ask the same wallet to unlock again when access is verified.'],
            ['Unlocked HashWatch explanation', 'Use verified metadata and media URL. Deeper media analysis routes to ZeroScout/0G when available.'],
            ['Live scores or Polymarket route', 'Answer only from verified context; otherwise clearly say live context is not verified.'],
            ['Unsupported request', 'Give a product-aware honest fallback instead of pretending live data or media analysis exists.'],
          ]}
        />
      </Section>

      <Section title="Hash PayLink API services for creators">
        <p>
          Hash PayLink also supports creators and developers who want to sell content or services through API access patterns. Today, API-style creator integrations are handled through support so we can configure the safest checkout and access flow for each use case.
        </p>
        <InfoBox type="info">
          Direct self-serve API integrations for HashpayStream creators are coming soon. For now, teams that want to sell content, datasets, media, or API services through Hash PayLink can contact <a href="mailto:support@hashpaylink.com" className="font-semibold underline">support@hashpaylink.com</a>.
        </InfoBox>
      </Section>

      <Section title="Durable app state">
        <p>
          HashpayStream stores creator content, unlocks, checkpoint reads, reactions, comments, views, and recent meter recovery state in durable backend storage when <Code>DATABASE_URL</Code> is configured. This protects the launch flow from Render redeploys and lets Agent Hash answer from verified app context.
        </p>
        <Table
          headers={['Layer', 'Role']}
          rows={[
            ['Postgres', 'Creator posts, unlock records, checkpoint reads, comments, reactions, content views, and recovery state.'],
            ['Arc vaults', 'USDC escrow, checkpoint release, timed stream claim, and refund state.'],
            ['0G extension', 'Receipt and creator activity archive records when proof is available.'],
            ['ZeroScout', 'Agent Hash intelligence, unlocked-content guidance, and media/URL analysis when compute is available.'],
          ]}
        />
      </Section>

      <Section title="Known launch limits">
        <ul className="space-y-2">
          <li>- Long HashWatch video analysis can exceed the live chat window and should use an async/background ZeroScout media path.</li>
          <li>- Live sports, scores, and Polymarket routes must come from verified context. The app should not guess current events.</li>
          <li>- 0G archive proof is displayed when available. It is not shown as an endless archiving promise.</li>
          <li>- Public testing uses Arc Testnet and test USDC.</li>
          <li>- Self-serve API integrations for creator services are coming soon; support-assisted setup is available now.</li>
        </ul>
      </Section>

      <Section title="Environment variables">
        <Table
          headers={['Variable', 'Description']}
          rows={[
            ['CHECKPOINT_FACTORY_ADDRESS', 'Server-side CheckpointVaultFactory address on Arc.'],
            ['VITE_CHECKPOINT_FACTORY_ADDRESS', 'Browser-accessible checkpoint factory address.'],
            ['STREAM_FACTORY_ADDRESS', 'Server-side StreamVaultFactory address on Arc.'],
            ['VITE_STREAM_FACTORY_ADDRESS', 'Browser-accessible stream factory address.'],
            ['DATABASE_URL', 'Durable creator content, unlocks, social activity, receipts, and recovery state.'],
            ['ZEROSCOUT_API_URL', 'ZeroScout intelligence endpoint for Agent Hash guidance.'],
            ['ZEROSCOUT_INTEGRATION_SECRET', 'Server-side ZeroScout integration secret.'],
            ['ZEROSCOUT_HASHWATCH_MEDIA_MODEL', 'Optional media model hint for short HashWatch analysis requests.'],
          ]}
        />
      </Section>

      <NavFooter
        prev={{ label: 'SDK', path: '/docs/sdk' }}
        next={{ label: 'Security', path: '/docs/security' }}
      />
    </DocPage>
  )
}
