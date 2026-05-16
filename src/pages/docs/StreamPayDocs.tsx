import { DocPage, DocHeader, Section, SubSection, CodeBlock, InfoBox, Code, Table, NavFooter } from './components'

export default function StreamPayDocs() {
  return (
    <DocPage>
      <DocHeader
        badge="StreamPay"
        title="StreamPay"
        description="USDC payroll streaming and creator paywalls, powered by time-sovereign and event-sovereign smart contracts on Arc."
      />

      <InfoBox type="info">StreamPay is a separate product hosted on the same service as Hash PayLink. It loads at streampay.xyz or by appending ?app=streampay to any hashpaylink.com URL.</InfoBox>

      <Section title="Two modes">
        <SubSection title="Payroll — Time-Sovereign Streaming">
          <p>Employers deposit USDC into a StreamVault contract. Employees accumulate claimable USDC in real time as seconds pass. They can claim their earned amount at any point using a gasless EIP-712 signature — no on-chain transaction from the employee needed until they want to withdraw.</p>
          <p className="mt-2">Employers can cancel the stream at any time via a signed message. Both claim and cancel are relayed gaslessly via <Code>/api/relay-stream</Code> on Arc.</p>
        </SubSection>

        <SubSection title="Creator Studio — Event-Sovereign PoA">
          <p>Proof-of-Attention (PoA) paywalls for gated content. A creator uploads content and sets a price. Viewers pay to access a stream session — their viewing time is tracked on-chain via a ghost vault signature. Revenue is settled when the viewer ends the session.</p>
          <p className="mt-2">Sessions use WebAuthn passkeys for authentication — no wallet connection required for viewers after initial setup. Session state is signed and stored locally with <Code>localStorage</Code>.</p>
        </SubSection>
      </Section>

      <Section title="Smart contracts">
        <Table
          headers={['Contract', 'Purpose', 'Network']}
          rows={[
            ['StreamVaultFactory', 'CREATE2 factory for per-stream payroll vaults', 'Arc Testnet'],
            ['StreamVault',        'Per-employee vault with EIP-712 claim/cancel',  'Arc Testnet'],
            ['PoASettlement',      'Proof-of-Attention settlement for creator revenue', 'Arc Testnet'],
          ]}
        />
        <InfoBox type="warning">StreamPay contracts are currently deployed on Arc Testnet. A mainnet deployment checklist is available in the repository at modules/streampay/DEPLOYMENT.md.</InfoBox>
      </Section>

      <Section title="Payroll flow">
        <ol className="list-none space-y-3">
          {[
            ['1', 'Deploy vault', 'Employer deploys a StreamVault via StreamVaultFactory with a defined rate (USDC per second) and duration.'],
            ['2', 'Deposit', 'Employer deposits the total stream amount into the vault.'],
            ['3', 'Stream starts', 'USDC accumulates for the employee in real time, tracked by block timestamp.'],
            ['4', 'Claim', 'Employee signs an EIP-712 claim message. Relayer submits it via /api/relay-stream. Employee receives earned USDC.'],
            ['5', 'Cancel (optional)', 'Employer signs a cancel message. Remaining balance returns to the employer.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-4">
              <span className="shrink-0 h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center mt-0.5">{num}</span>
              <div>
                <strong className="text-gray-800 dark:text-gray-200">{title}: </strong>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Creator Studio flow">
        <ol className="list-none space-y-3">
          {[
            ['1', 'Upload content', 'Creator uploads content and sets price. Stored via /api/store-content.'],
            ['2', 'Viewer pays', 'Viewer pays via a Hash PayLink ghost vault. Session signature is generated.'],
            ['3', 'PoA tracking', 'Viewing time is tracked. A drip-meter accumulates owed payment proportional to time watched.'],
            ['4', 'Settle', 'When viewer ends session, /api/settle-poa submits the PoA proof and releases creator revenue.'],
          ].map(([num, title, desc]) => (
            <li key={num} className="flex gap-4">
              <span className="shrink-0 h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center mt-0.5">{num}</span>
              <div>
                <strong className="text-gray-800 dark:text-gray-200">{title}: </strong>
                <span className="text-gray-600 dark:text-gray-400">{desc}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="0G proof extension">
        <p>StreamPay is part of the same Hash PayLink proof architecture. Payroll streams and creator proof-of-attention sessions settle on Arc today, and their settlement records are designed to become 0G-verifiable receipts using the same archive pattern as multi-payer collections.</p>
        <Table
          headers={['StreamPay event', '0G record']}
          rows={[
            ['Stream created', 'Vault address, sender, recipient, total amount, start/end time, Arc transaction hash.'],
            ['Claim submitted', 'Recipient, claim amount, already withdrawn amount, relayer transaction hash.'],
            ['Stream cancelled', 'Unlocked recipient amount, refunded sender amount, cancellation transaction hash.'],
            ['Creator PoA settled', 'Content ID, viewer session, attention duration, creator payout, settlement proof.'],
          ]}
        />
        <InfoBox type="info">The shared 0G model lets Hash PayLink prove both instant payments and time-based payment outcomes: who paid, what unlocked, when it settled, and which on-chain transaction backs the record.</InfoBox>
      </Section>

      <Section title="WebAuthn passkey integration">
        <p>StreamPay uses WebAuthn passkeys for viewer authentication in the Creator Studio. No wallet connection is required after initial setup. Passkey signatures are stored in <Code>localStorage</Code> under the key pattern <Code>sp_poa_{'{contentId}'}_{'{viewer}'}</Code>.</p>
        <p className="mt-2">If a viewer closes their tab mid-session without signing, <Code>navigator.sendBeacon</Code> submits a partial PoA proof automatically.</p>
      </Section>

      <Section title="Environment variables">
        <Table
          headers={['Variable', 'Description']}
          rows={[
            ['STREAM_FACTORY_ADDRESS',      'StreamVaultFactory contract on Arc'],
            ['VITE_STREAM_FACTORY_ADDRESS', 'Browser-accessible factory address'],
            ['ARC_POA_CONTRACT',            'PoASettlement contract on Arc'],
            ['VITE_POA_CONTRACT',           'Browser-accessible PoA contract'],
          ]}
        />
      </Section>

      <Section title="Known limitations">
        <ul className="list-none space-y-2">
          <li>• <strong className="text-gray-800 dark:text-gray-200">In-memory storage:</strong> Content and vault state is stored in memory — data resets on server restart. Redis is recommended for production.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">No Arc Paymaster:</strong> Arc Testnet does not yet have a paymaster. Gas is covered by the relayer key directly.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">No smart account support:</strong> ERC-4337 account abstraction is not yet implemented.</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Testnet only:</strong> All contracts are on Arc Testnet. Mainnet deployment requires the checklist in DEPLOYMENT.md.</li>
        </ul>
      </Section>

      <NavFooter
        prev={{ label: 'SDK', path: '/docs/sdk' }}
        next={{ label: 'Security', path: '/docs/security' }}
      />
    </DocPage>
  )
}
