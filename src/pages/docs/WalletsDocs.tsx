import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, NavFooter } from './components'

export default function WalletsDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Wallet Setup"
        description="Current wallet access is built around hosted checkout, email identity, and Circle wallet sessions."
      />

      <InfoBox type="tip">Hash PayLink keeps wallet execution inside the current Circle-aligned hosted checkout instead of asking payers to use a manual deposit address.</InfoBox>

      <Section title="Privy + Circle">
        <SubSection title="HashpayStream and Arena">
          <p>HashpayStream and Arena use Privy for email-first sign-in and Circle wallet sessions for Arc wallet actions. This keeps the experience simple for consumers while preserving wallet-based settlement.</p>
        </SubSection>
        <SubSection title="Agent and PolyDesk flows">
          <p>Agentic flows use selected paying agents, Circle wallet sessions, and x402-style service receipts where applicable. PolyDesk stores user preferences and alert settings server-side so Telegram sessions can persist.</p>
        </SubSection>
      </Section>

      <Section title="Connected wallets">
        <SubSection title="EVM">
          <p>Base, Arbitrum, and Arc Testnet support EVM wallet addresses. Existing connected-wallet paths remain available where the checkout flow needs them.</p>
        </SubSection>
        <SubSection title="Solana">
          <p>Solana recipients use base58 public keys. Phantom and Solflare are common wallets for Solana USDC payments.</p>
        </SubSection>
      </Section>

      <Section title="Legacy manual-address checkout">
        <InfoBox type="warning">The older Send via Address checkout is not currently offered. Its backend implementation is retained for a possible future rollout if there is verified demand.</InfoBox>
      </Section>

      <Section title="Arc Testnet setup">
        <p>For Arc Testnet testing, add the network manually if your wallet does not detect it:</p>
        <ul className="list-none space-y-1 mt-2 font-mono text-xs text-gray-600 dark:text-gray-400">
          <li>Network name: <Code>Arc Testnet</Code></li>
          <li>RPC URL: <Code>https://rpc.testnet.arc.network</Code></li>
          <li>Chain ID: <Code>5042002</Code></li>
          <li>Explorer: <Code>https://testnet.arcscan.app</Code></li>
        </ul>
      </Section>

      <NavFooter
        prev={{ label: 'Security', path: '/docs/security' }}
        next={{ label: 'Environment Variables', path: '/docs/environment' }}
      />
    </DocPage>
  )
}
