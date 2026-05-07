import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, NavFooter } from './components'

export default function WalletsDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Wallet Setup"
        description="Supported wallets and setup guides for each chain. Most payers can use Hash PayLink without any wallet connection via the Send via Address flow."
      />

      <InfoBox type="tip">You don't need a wallet to pay via Hash PayLink. Use <strong>Send via Address</strong> to pay directly from Binance, Coinbase, a hardware wallet, or any source — no browser extension needed.</InfoBox>

      <Section title="EVM wallets (Base, HashKey, Arc, Arbitrum)">
        <SubSection title="MetaMask">
          <p>Install the MetaMask browser extension or mobile app. Hash PayLink automatically prompts network switching when you connect on a different chain. No manual network configuration required for Base.</p>
          <p className="mt-1 text-sm">For Arc Testnet: add manually with Chain ID <Code>5042002</Code>, RPC <Code>https://rpc.arc-testnet.io</Code>.</p>
        </SubSection>

        <SubSection title="Coinbase Wallet">
          <p>Coinbase Wallet (browser extension or mobile) supports Base natively. Connect and approve the chain switch prompt automatically shown by Hash PayLink.</p>
        </SubSection>

        <SubSection title="WalletConnect">
          <p>Any WalletConnect-compatible mobile wallet works by scanning the QR code shown after clicking Connect Wallet. This includes Rainbow, Trust Wallet, Zerion, and others.</p>
        </SubSection>
      </Section>

      <Section title="Starknet wallets">
        <SubSection title="ArgentX">
          <p>ArgentX is the recommended Starknet wallet. Install the browser extension from argent.xyz. Your Starknet address is 66 characters: <Code>0x</Code> + 64 hex digits. Paste it into the Starknet recipient field when creating a link.</p>
        </SubSection>

        <SubSection title="Braavos">
          <p>Braavos is a full-featured Starknet wallet with biometric signing support. Install from braavos.app. Compatible with all Hash PayLink Starknet payment flows.</p>
        </SubSection>

        <InfoBox type="info">AVNU Paymaster covers all STRK gas fees on Starknet payments through Hash PayLink. Payers need only USDC in their Starknet wallet.</InfoBox>
      </Section>

      <Section title="Solana wallets">
        <SubSection title="Phantom">
          <p>Phantom is the most widely used Solana wallet. Install from phantom.app. Your Solana address is a base58-encoded public key. Paste it into the Solana recipient field when creating a link.</p>
        </SubSection>

        <SubSection title="Solflare">
          <p>Solflare supports Solana and Ethereum. Install from solflare.com. Compatible with Hash PayLink Solana payment flows.</p>
        </SubSection>

        <InfoBox type="info">The Hash PayLink relayer covers all SOL transaction fees. Payers sign only the USDC transfer — no SOL required in the payer's wallet.</InfoBox>
      </Section>

      <Section title="Send via Address (no wallet required)">
        <p>For payers who want to send from a CEX or hardware wallet without connecting a browser extension:</p>
        <ol className="list-none space-y-2 mt-2">
          <li>• Open the payment link</li>
          <li>• Select <strong className="text-gray-800 dark:text-gray-200">Send via Address</strong> tab</li>
          <li>• Copy the displayed vault address</li>
          <li>• Send the exact USDC amount from Binance, Coinbase, Bybit, Ledger, or any other source</li>
          <li>• Payment is detected automatically within 2–10 seconds</li>
        </ol>
        <InfoBox type="warning">Send the exact amount shown. Underpayments are detected and flagged. The vault address is unique per payment link — do not reuse it for future payments.</InfoBox>
      </Section>

      <Section title="Arc Testnet setup">
        <p>To test on Arc Testnet, add the network manually to MetaMask:</p>
        <ul className="list-none space-y-1 mt-2 font-mono text-xs text-gray-600 dark:text-gray-400">
          <li>Network name: <Code>Arc Testnet</Code></li>
          <li>RPC URL: <Code>https://rpc.arc-testnet.io</Code></li>
          <li>Chain ID: <Code>5042002</Code></li>
          <li>Currency symbol: <Code>ETH</Code></li>
          <li>Explorer: <Code>https://explorer.arc-testnet.io</Code></li>
        </ul>
        <p className="mt-3">Get testnet USDC from the Arc faucet. Contact the Arc team for faucet access details.</p>
      </Section>

      <Section title="Branded QR codes">
        <p>Businesses can request custom branded QR codes with their logo embedded. Email <a href="mailto:support@hashpaylink.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@hashpaylink.com</a> with your payment link and brand assets.</p>
        <p className="mt-2">Standard QR codes are generated automatically at 1024×1024px and are downloadable from the link creation page.</p>
      </Section>

      <NavFooter
        prev={{ label: 'Security', path: '/docs/security' }}
        next={{ label: 'Environment Variables', path: '/docs/environment' }}
      />
    </DocPage>
  )
}
