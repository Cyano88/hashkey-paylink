import { DocPage, DocHeader, Section, CodeBlock, InfoBox, Code, Table, NavFooter } from './components'

export default function ZeroGStorage() {
  return (
    <DocPage>
      <DocHeader badge="0G Integration" title="0G Storage Integration"
        description="Hash PayLink uses 0G Storage and on-chain archive records to support receipt inspection and dispute evidence. Archive status is separate from payment settlement." />

      <Section title="Archive flow">
        <p>Supported server flows serialize a record, upload it through the 0G indexer, and submit its Merkle root to PayLinkArchive on 0G Mainnet. Archiving can be skipped or fail when configuration, storage, or transaction submission is unavailable.</p>
        <InfoBox type="info">A payment can complete without a successful archive. Check the individual receipt for archive evidence; do not assume every payment or product action has been archived.</InfoBox>
      </Section>

      <Section title="What an archive proves">
        <Table headers={['Evidence', 'Meaning']} rows={[
          ['PaymentArchived event', 'The archive contract recorded the supplied fields and root in a blockchain transaction.'],
          ['Matching retrieved payload', 'Recomputing the retrieved payload Merkle root and comparing it with the recorded root checks content integrity.'],
          ['Source-chain settlement', 'Verify the original payment separately, including its network, token, recipient, amount and transaction status.'],
          ['Dispute evidence', 'A receipt and its archive can support investigation. They do not automatically resolve a dispute or establish legal compliance.'],
        ]} />
        <p className="mt-3">Contract fields include public metadata. An archive event is not a privacy guarantee, an identity check, or evidence of ownership of the payer name.</p>
      </Section>

      <Section title="PayLinkArchive contract">
        <Table headers={['Property', 'Value']} rows={[
          ['Contract address', '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'],
          ['Network', '0G Mainnet'],
          ['Chain ID', '16661'],
        ]} />
        <p className="mt-3"><a href="https://chainscan.0g.ai/address/0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Inspect the archive contract</a>. Explorer transaction totals are not a count of unique payments, users, or retrievable files.</p>
        <CodeBlock lang="solidity">{`event PaymentArchived(
  string indexed eventId,
  bytes32 indexed rootHash,
  string chain,
  string payer,
  string amount,
  uint256 ts
);`}</CodeBlock>
      </Section>

      <Section title="Historical root encoding">
        <p>The archive writer was corrected on September 17, 2026 to preserve the complete 32-byte Merkle root. Earlier records can contain truncated UTF-8 text instead of the original root. The writer correction does not repair those historical records.</p>
        <InfoBox type="info">A historical explorer link confirms the recorded transaction. It does not establish that the recorded root can retrieve the original file. Validate the payload and root before describing a receipt as a verified storage proof.</InfoBox>
      </Section>

      <Section title="Legacy archive lookup">
        <CodeBlock lang="text">{'GET /api/agent-verify?eventId=YOUR_EVENT_ID&payer=YOUR_PAYER_LABEL'}</CodeBlock>
        <p>The existing endpoint looks for an archive event with the requested event ID and payer label. Its legacy <Code>verified: true</Code> field means that a matching archive event was found. It does not retrieve the payload, compare its Merkle root, or verify settlement on the original payment network.</p>
        <p className="mt-3">Do not use this lookup alone to authorize fulfillment or payment-gated access. A payer label is not authentication. Retired Telegram and general web Agent Hash flows are not part of this integration guide.</p>
      </Section>

      <Section title="Inspect a receipt">
        <p>Use the receipt's source-chain transaction to check settlement, and its separate 0G transaction link to inspect the archive. For content verification, retrieve the archived payload and compare its computed Merkle root with the on-chain value. Report unavailable or mismatched evidence explicitly.</p>
        <p className="mt-3">When querying logs, use known transaction receipts or bounded block ranges with saved progress. Avoid repeatedly scanning contract history from deployment to the latest block.</p>
      </Section>
      <NavFooter prev={{ label: 'Chains', path: '/docs/chains/base' }} next={{ label: 'Access Mode', path: '/docs/access-mode' }} />
    </DocPage>
  )
}
