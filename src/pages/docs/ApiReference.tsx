import { DocPage, DocHeader, Section, SubSection, CodeBlock, Table, NavFooter } from './components'

export default function ApiReference() {
  return (
    <DocPage>
      <DocHeader
        title="API Endpoints"
        description="Current public API reference for the Render-hosted Hash PayLink platform."
      />

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
        <SubSection title="POST /api/relay-v2">
          <p>Relays supported Base, Arc, and Arbitrum payment actions or ghost-vault sweeps.</p>
        </SubSection>
      </Section>

      <Section title="Solana relay">
        <SubSection title="POST /api/solana-build-tx">
          <p>Builds a Solana USDC transfer transaction with the Hash PayLink relayer as fee payer.</p>
        </SubSection>
        <SubSection title="POST /api/solana-relay">
          <p>Submits a payer-signed Solana transaction.</p>
        </SubSection>
        <SubSection title="GET /api/solana-vault">
          <p>Returns the deterministic vault address for a Solana Send via Address checkout.</p>
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

      <Section title="HashpayStream and Arena">
        <Table
          headers={['Endpoint', 'Purpose']}
          rows={[
            ['/api/privy-circle-link', 'Privy to Circle wallet mapping'],
            ['/api/stream-create', 'Create HashpayStream streams'],
            ['/api/stream-status', 'Read stream state'],
            ['/api/arena-room', 'Create and manage Arena room state'],
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
