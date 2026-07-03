import { DocPage, DocHeader, Section, SubSection, Code, Table, InfoBox, NavFooter } from './components'

export default function StreamPayDocs() {
  return (
    <DocPage>
      <DocHeader
        badge="HashpayStream"
        title="HashpayStream"
        description="USDC payroll, agentic streams, and recoverable-risk Arena rooms on Arc."
      />

      <InfoBox type="info">
        HashpayStream is hosted on the same Render service as Hash PayLink and loads with <Code>?app=streampay</Code>. The visible product nav focuses on Payroll, Agentic, and Arena.
      </InfoBox>

      <Section title="Primary modes">
        <SubSection title="Payroll - Time-Sovereign Streaming">
          <p>Employers deposit USDC into a StreamVault contract. Recipients accumulate claimable USDC as time passes and can claim with a gasless EIP-712 signature through <Code>/api/relay-stream</Code>.</p>
          <p className="mt-2">Privy email sign-in and Circle wallet mapping are the primary website identity layer for sender-side stream creation.</p>
        </SubSection>

        <SubSection title="Agentic - Daily Service Streaming">
          <p>Users stream Arc USDC to the Hash PayLink Agent for recurring services such as daily Polymarket LP research. The same Privy + Circle setup is mirrored between website and Telegram flows.</p>
        </SubSection>

        <SubSection title="Arena - Recoverable-Risk Rooms">
          <p>Private Arena rooms use per-room escrow contracts. Players deposit USDC, risk streams round by round, and keep unstreamed balances claimable when eliminated. Completed rooms charge a 0.5% platform fee.</p>
        </SubSection>
      </Section>

      <Section title="Smart contracts">
        <Table
          headers={['Contract', 'Purpose', 'Network']}
          rows={[
            ['StreamVaultFactory', 'CREATE2 factory for per-stream payroll vaults', 'Arc Testnet'],
            ['StreamVault', 'Per-recipient vault with EIP-712 claim/cancel', 'Arc Testnet'],
            ['ArenaRoomEscrowFactory', 'CREATE2 factory for private Arena room escrows', 'Arc Testnet'],
            ['ArenaRoomEscrow', 'Per-room USDC escrow for deposits, refunds, winner settlement, and 0.5% fee', 'Arc Testnet'],
          ]}
        />
        <InfoBox type="warning">HashpayStream contracts are currently deployed on Arc Testnet. Mainnet deployment requires the checklist in modules/streampay/DEPLOYMENT.md.</InfoBox>
      </Section>

      <Section title="Payroll flow">
        <ol className="list-none space-y-3">
          {[
            ['1', 'Sign in', 'Sender signs in with Privy and opens a mapped Circle wallet session.'],
            ['2', 'Deploy vault', 'The app deploys or uses a StreamVault with a defined amount, duration, and recipient.'],
            ['3', 'Fund stream', 'USDC is locked in the vault on Arc.'],
            ['4', 'Claim', 'Recipient signs an EIP-712 claim message; the relayer submits it and the recipient receives unlocked USDC.'],
            ['5', 'Cancel if needed', 'Sender can cancel and return the locked remainder according to the vault rules.'],
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

      <Section title="Arena storage and settlement">
        <p>HashpayStream Arena uses Postgres as durable room state and Arc escrow contracts for money. Postgres stores room settings, status, player count, escrow address, and payment status. It does not custody funds.</p>
        <Table
          headers={['Layer', 'Role']}
          rows={[
            ['Postgres', 'Room settings, invite links, status, deposit state, and UI continuity across Render redeploys.'],
            ['Arena escrow', 'USDC deposits, recoverable refunds, winner settlement, and 0.5% platform fee.'],
            ['0G extension', 'Permanent room proofs and final result archives after settlement.'],
          ]}
        />
      </Section>

      <Section title="0G proof extension">
        <p>HashpayStream is part of the same Hash PayLink proof architecture. Payroll streams, agentic streams, and Arena outcomes can become 0G-verifiable records using the same durable proof pattern as multi-payer collections and agent receipts.</p>
        <Table
          headers={['HashpayStream event', '0G record']}
          rows={[
            ['Stream created', 'Vault address, sender, recipient, amount, duration, Arc transaction hash.'],
            ['Claim submitted', 'Recipient, claim amount, withdrawn amount, relayer transaction hash.'],
            ['Stream cancelled', 'Unlocked recipient amount, refunded sender amount, cancellation transaction hash.'],
            ['Arena room settled', 'Room ID, escrow address, entrants, winner, refunds, platform fee, and settlement transaction.'],
          ]}
        />
      </Section>

      <Section title="Legacy direct routes">
        <InfoBox type="warning">
          Creator and gate routes still exist as direct legacy module routes, but they are not the primary public HashpayStream nav. Do not use them as the main product pitch.
        </InfoBox>
      </Section>

      <Section title="Environment variables">
        <Table
          headers={['Variable', 'Description']}
          rows={[
            ['STREAM_FACTORY_ADDRESS', 'StreamVaultFactory contract on Arc'],
            ['VITE_STREAM_FACTORY_ADDRESS', 'Browser-accessible factory address'],
            ['ARENA_ESCROW_FACTORY_ADDRESS', 'Server-side Arena escrow factory address'],
            ['VITE_ARENA_ESCROW_FACTORY_ADDRESS', 'Browser-accessible Arena factory address'],
            ['ARENA_RELAYER_PRIVATE_KEY', 'Server-only room escrow deployer and settlement wallet'],
            ['DATABASE_URL', 'Postgres room state and Privy/Circle mapping storage'],
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
