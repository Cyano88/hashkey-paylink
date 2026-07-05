import { DocPage, DocHeader, Section, SubSection, Code, Table, InfoBox, NavFooter } from './components'

export default function StreamPayDocs() {
  return (
    <DocPage>
      <DocHeader
        badge="HashpayStream"
        title="HashpayStream"
        description="Creator content, fixed x402 unlocks, and pay-as-you-read USDC settlement on Arc."
      />

      <InfoBox type="info">
        HashpayStream is a Hash PayLink creator product. Public testing is focused on Creator, x402 wallet access, Agent Hash guidance, paid articles, live-score routes, ebooks, comments, receipts, and checkpoint-based pay-as-you-read.
      </InfoBox>

      <Section title="Public creator flow">
        <SubSection title="Discover">
          <p>Readers browse approved creator posts and official drops across World Cup news, live scores, crypto, ebooks, and developer guides. Each card can route to a gated checkout with a stable content ID.</p>
        </SubSection>

        <SubSection title="Fixed unlock">
          <p>Fixed unlocks use the Circle Gateway/x402 flow. A reader pays once, access is restored for the same reader wallet, and the receipt follows the Hash PayLink receipt and 0G archive pattern.</p>
        </SubSection>

        <SubSection title="Pay as you read">
          <p>Checkpoint reading locks a prepaid USDC budget and releases creator earnings only as the reader reaches scroll milestones. Unread balance stays refundable from the reader streams tab.</p>
        </SubSection>

        <SubSection title="Creator earnings">
          <p>Creators sign in with an email wallet, view fixed unlocks and checkpoint reads tied to their creator wallet, and track claimable stream earnings without pasting vault IDs.</p>
        </SubSection>
      </Section>

      <Section title="Smart contracts">
        <Table
          headers={['Contract', 'Purpose', 'Network']}
          rows={[
            ['CheckpointVaultFactory', 'CREATE2 factory for pay-as-you-read checkpoint escrow vaults', 'Arc Testnet'],
            ['CheckpointVault', 'Per-reader prepaid vault with milestone release and unread refund support', 'Arc Testnet'],
            ['StreamVaultFactory', 'Timed stream factory retained for live/video meter flows', 'Arc Testnet'],
            ['StreamVault', 'Per-recipient stream vault with claim/cancel support', 'Arc Testnet'],
          ]}
        />
        <InfoBox type="warning">HashpayStream public testing currently uses Arc Testnet contracts and Circle email wallet sessions.</InfoBox>
      </Section>

      <Section title="Pay-as-you-read flow">
        <ol className="list-none space-y-3">
          {[
            ['1', 'Choose content', 'Reader opens a Creator checkout from an approved content card or direct gate link.'],
            ['2', 'Pick access mode', 'Reader chooses fixed unlock or pay-as-you-read when the content can render inside HashpayStream.'],
            ['3', 'Start checkpoint escrow', 'The reader wallet prepays the content budget into an Arc checkpoint vault.'],
            ['4', 'Read naturally', 'Creator earnings release at reading milestones such as 25%, 50%, 75%, and 100%.'],
            ['5', 'Recover unread balance', 'Reader can end reading and refund the unread portion from the content page or Streams tab.'],
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

      <Section title="Durable state">
        <p>HashpayStream stores creator content, unlocks, checkpoint reads, reactions, comments, views, and recent meter recovery state in durable backend storage when <Code>DATABASE_URL</Code> is configured. This is required for Render redeploy safety.</p>
        <Table
          headers={['Layer', 'Role']}
          rows={[
            ['Postgres', 'Creator posts, unlock records, checkpoint reads, comments, reactions, and content views.'],
            ['Arc vaults', 'USDC escrow, checkpoint release, timed stream claim, and refund state.'],
            ['0G extension', 'Receipt and creator activity archive records when proof is available.'],
          ]}
        />
      </Section>

      <Section title="0G proof extension">
        <p>HashpayStream is part of the same Hash PayLink proof architecture. Creator unlocks, checkpoint reads, comments, and stream activity can use the same durable proof pattern as multi-payer collections and agent receipts.</p>
        <Table
          headers={['HashpayStream event', '0G record']}
          rows={[
            ['Fixed unlock', 'Content ID, reader wallet, creator wallet, amount, Circle Gateway receipt reference.'],
            ['Checkpoint read', 'Content ID, vault address, reader wallet, creator wallet, released amount, progress milestone.'],
            ['Refund', 'Vault address, reader wallet, consumed amount, refunded amount, Arc transaction hash.'],
            ['Creator claim', 'Creator wallet, claimable amount, vault address, settlement transaction.'],
          ]}
        />
      </Section>

      <Section title="Agent Hash">
        <p>Agent Hash runs inside HashpayStream as a creator-focused assistant powered by ZeroScout intelligence. It can explain checkout modes, recommend content from verified app context, help with x402 activation wording, and answer earnings or publishing questions without guessing unavailable live stats.</p>
      </Section>

      <Section title="Environment variables">
        <Table
          headers={['Variable', 'Description']}
          rows={[
            ['CHECKPOINT_FACTORY_ADDRESS', 'Server-side CheckpointVaultFactory address on Arc'],
            ['VITE_CHECKPOINT_FACTORY_ADDRESS', 'Browser-accessible checkpoint factory address'],
            ['STREAM_FACTORY_ADDRESS', 'StreamVaultFactory contract on Arc'],
            ['VITE_STREAM_FACTORY_ADDRESS', 'Browser-accessible factory address'],
            ['DATABASE_URL', 'Durable creator content, unlocks, social activity, and recovery state'],
            ['ZEROSCOUT_API_URL', 'ZeroScout intelligence endpoint for Agent Hash guidance'],
            ['ZEROSCOUT_INTEGRATION_SECRET', 'Server-side ZeroScout integration secret'],
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
