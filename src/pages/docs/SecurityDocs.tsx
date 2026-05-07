import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, NavFooter } from './components'

export default function SecurityDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Security"
        description="Hash PayLink is non-custodial, open-source, and built around EIP-712 typed signatures. Funds never pass through any Hash PayLink-controlled account."
      />

      <Section title="Non-custodial architecture">
        <p>Hash PayLink never holds user funds. Every payment flow either:</p>
        <ul className="list-none space-y-2 mt-2">
          <li>• <strong className="text-gray-800 dark:text-gray-200">Transfers directly</strong> from payer wallet to recipient via an atomic on-chain transaction</li>
          <li>• <strong className="text-gray-800 dark:text-gray-200">Routes through a transparent CREATE2 ghost vault</strong> — the vault's sweep logic is enforced by the smart contract, not by Hash PayLink's server</li>
        </ul>
        <InfoBox type="tip">Hash PayLink will never ask for your private key, seed phrase, or wallet password. Never DMs first on any platform. Only interact with links from hashpaylink.com.</InfoBox>
      </Section>

      <Section title="EIP-712 typed signatures">
        <p>All payment authorizations use EIP-712 structured data signing. This prevents:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• Raw signature replay attacks</li>
          <li>• Blind signing (the wallet shows the user exactly what they're authorizing)</li>
          <li>• Cross-contract signature reuse (domain separator binds the sig to a specific contract)</li>
        </ul>
        <p className="mt-3">The EIP-2612 permit pattern means the user authorizes the exact amount to the exact contract — nothing more, nothing less.</p>
      </Section>

      <Section title="Smart contract guarantees">
        <SubSection title="onlyRelayer modifier">
          <p>Ghost vault sweep functions are restricted to the authorized relayer address. No third party can claim funds from a vault, even if they know the vault address.</p>
        </SubSection>
        <SubSection title="MAX_GAS_REIMB cap">
          <p>Gas reimbursements to the relayer are capped at 1.00 USDC per transaction. This prevents the relayer from draining user deposits via inflated gas claims.</p>
        </SubSection>
        <SubSection title="CREATE2 collision guard">
          <p>The factory contract includes collision resistance checks to prevent two payments from targeting the same vault address, which would cause fund mixing.</p>
        </SubSection>
        <SubSection title="Platform fee enforcement">
          <p>The 0.2% platform fee (20 bps) is deducted atomically in the same transaction as the transfer. There is no separate fee collection step — the fee cannot be increased after the user signs.</p>
        </SubSection>
      </Section>

      <Section title="Private key isolation">
        <p>Relayer private keys are stored as server-side environment variables and never included in client-side code or exposed in API responses. The frontend never has access to any private key.</p>
        <p className="mt-2">Separate relayer keys are used per chain:</p>
        <ul className="list-none space-y-1 mt-1 font-mono text-xs text-gray-600 dark:text-gray-400">
          <li>• <Code>RELAYER_PRIVATE_KEY</Code> — Base / primary EVM</li>
          <li>• <Code>RELAYER_PRIVATE_KEY_ARC</Code> — Arc</li>
          <li>• <Code>RELAYER_PRIVATE_KEY_HASHKEY</Code> — HashKey</li>
          <li>• <Code>RELAYER_PRIVATE_KEY_ARB</Code> — Arbitrum</li>
          <li>• <Code>RELAYER_PRIVATE_KEY_SOLANA</Code> — Solana</li>
          <li>• <Code>STARKNET_RELAYER_PRIVATE_KEY</Code> — Starknet</li>
          <li>• <Code>OG_STORAGE_KEY</Code> — 0G Storage archiving</li>
        </ul>
      </Section>

      <Section title="Open source">
        <p>All smart contracts and payment logic are open source and auditable on <a href="https://github.com/Cyano88/hashkey-paylink" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">GitHub</a>. The contracts directory contains:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• <Code>PayLinkFactoryV2.sol</Code> — CREATE2 vault factory</li>
          <li>• <Code>PayLinkArchive.sol</Code> — 0G Mainnet payment proof registry</li>
          <li>• <Code>StreamVault.sol</Code> + <Code>StreamVaultFactory.sol</Code> — StreamPay payroll</li>
          <li>• <Code>PoASettlement.sol</Code> — Creator Studio revenue settlement</li>
        </ul>
      </Section>

      <Section title="Phishing warning">
        <p>Hash PayLink is a non-custodial platform. The team will:</p>
        <ul className="list-none space-y-1 mt-2">
          <li>• <strong className="text-red-600 dark:text-red-400">Never</strong> ask for your private key or seed phrase</li>
          <li>• <strong className="text-red-600 dark:text-red-400">Never</strong> DM you first on X, Telegram, or Discord</li>
          <li>• <strong className="text-red-600 dark:text-red-400">Never</strong> ask you to send funds to verify your wallet</li>
        </ul>
        <p className="mt-3">If you receive a suspicious message claiming to be from Hash PayLink, report it to <a href="mailto:support@hashpaylink.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@hashpaylink.com</a>.</p>
      </Section>

      <NavFooter
        prev={{ label: 'StreamPay', path: '/docs/streampay' }}
        next={{ label: 'Wallet Setup', path: '/docs/wallets' }}
      />
    </DocPage>
  )
}
