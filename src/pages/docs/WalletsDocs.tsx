import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, NavFooter } from './components'

export default function WalletsDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Wallet Setup"
        description="Current wallet access is built around hosted checkout, Privy sign-in, Circle wallet sessions, and Send via Address."
      />

      <InfoBox type="tip">Many Hash PayLink flows do not require the payer to connect a browser wallet. Send via Address lets a payer send USDC from an exchange, hardware wallet, or any wallet that supports the selected network.</InfoBox>

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

      <Section title="Send via Address">
        <p>For payers who do not want to connect a wallet:</p>
        <ol className="list-none space-y-2 mt-2">
          <li>- Open the payment link.</li>
          <li>- Choose the supported network.</li>
          <li>- Copy the displayed vault or recipient address.</li>
          <li>- Send the exact USDC amount.</li>
          <li>- Hash PayLink detects settlement and updates the receipt.</li>
        </ol>
        <InfoBox type="warning">Send the exact amount shown. Do not reuse one-time vault addresses for unrelated payments.</InfoBox>
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
