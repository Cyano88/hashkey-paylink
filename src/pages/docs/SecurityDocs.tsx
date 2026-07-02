import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, NavFooter } from './components'

export default function SecurityDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Security"
        description="Hash PayLink is non-custodial, server-secret isolated, and built around hosted checkout plus verifiable receipts."
      />

      <Section title="Non-custodial payments">
        <p>Hash PayLink does not ask users for seed phrases or private keys. Payment flows either transfer directly through wallet-confirmed actions or route through transparent vault/escrow logic for supported flows.</p>
        <InfoBox type="tip">Only trust links on hashpaylink.com. Hash PayLink will never ask for a private key, seed phrase, or wallet password.</InfoBox>
      </Section>

      <Section title="Hosted execution">
        <p>Developers and merchants can use Hash PayLink URLs or SDK helpers without embedding wallet-provider code into their own apps. Wallet/session execution stays inside the hosted checkout surface.</p>
      </Section>

      <Section title="Private key isolation">
        <p>Relayer, Circle, 0G, Sportmonks, Resend, and admin credentials are server-side environment variables on Render. They are not exposed through browser code or committed files.</p>
        <ul className="list-none space-y-1 mt-2 font-mono text-xs text-gray-600 dark:text-gray-400">
          <li>- <Code>RELAYER_PRIVATE_KEY</Code> - Base and fallback EVM relayer</li>
          <li>- <Code>RELAYER_PRIVATE_KEY_ARC</Code> - Arc relayer</li>
          <li>- <Code>RELAYER_PRIVATE_KEY_ARB</Code> - Arbitrum relayer</li>
          <li>- <Code>RELAYER_PRIVATE_KEY_SOLANA</Code> - Solana relayer</li>
          <li>- <Code>ARENA_RELAYER_PRIVATE_KEY</Code> - Arena escrow actions</li>
          <li>- <Code>OG_STORAGE_KEY</Code> - 0G proof archiving</li>
        </ul>
      </Section>

      <Section title="Current contracts">
        <p>Contract and payment logic are auditable in the public repository. Current product-facing contract areas include:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>- <Code>PayLinkFactoryV2.sol</Code> - CREATE2 vault factory</li>
          <li>- <Code>PayLinkArchive.sol</Code> - 0G payment proof registry</li>
          <li>- <Code>StreamVault.sol</Code> and <Code>StreamVaultFactory.sol</Code> - StreamPay payroll</li>
          <li>- <Code>ArenaRoomEscrow.sol</Code> and <Code>ArenaRoomEscrowFactory.sol</Code> - StreamPay Arena escrow settlement</li>
        </ul>
      </Section>

      <Section title="0G proof layer">
        <p>Eligible payment and receipt records can be archived to 0G Storage so downstream agents and dashboards can verify payment state without trusting a private database.</p>
      </Section>

      <Section title="Operational controls">
        <SubSection title="Postgres durability">
          <p>Receipts, agent/helper state, POS profiles, PolyDesk, Privy/Circle mappings, and Arena room state use Render Postgres instead of ephemeral local files.</p>
        </SubSection>
        <SubSection title="Email alerts">
          <p>Portfolio and report emails use Resend. Delivery secrets remain server-side.</p>
        </SubSection>
      </Section>

      <Section title="Phishing warning">
        <p>Hash PayLink will never DM first to request funds or keys. Suspicious messages should be reported to <a href="mailto:support@hashpaylink.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@hashpaylink.com</a>.</p>
      </Section>

      <NavFooter
        prev={{ label: 'StreamPay', path: '/docs/streampay' }}
        next={{ label: 'Wallet Setup', path: '/docs/wallets' }}
      />
    </DocPage>
  )
}
