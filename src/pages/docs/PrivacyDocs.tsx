import { DocPage, DocHeader, Section, InfoBox } from './components'

export default function PrivacyDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Privacy Policy"
        description="How Hash PayLink handles account, wallet, payment, and support information."
        badge="Last updated June 3, 2026"
      />

      <InfoBox type="info">
        Hash PayLink is non-custodial and does not ask for private keys, seed phrases, or wallet passwords.
      </InfoBox>

      <Section title="Information we process">
        <p>
          Hash PayLink may process wallet addresses, payment link parameters, payment amounts, selected networks, payment notes, transaction hashes, payer names for multi-payer collections, dashboard records, and support messages you choose to send.
        </p>
        <p>
          If you sign in with email, authentication may be handled through providers such as Privy and Circle. Hash PayLink may receive basic account identifiers, email address, wallet address mappings, and session status needed to connect your account to the payment flow.
        </p>
      </Section>

      <Section title="On-chain and public data">
        <p>
          Blockchain transactions are public. Wallet addresses, amounts, transaction hashes, timestamps, smart contract interactions, and payment records may be visible on supported blockchains, block explorers, and decentralized storage systems.
        </p>
        <p>
          Do not put sensitive personal information in payment notes, memos, payer names, URLs, or dashboard fields.
        </p>
      </Section>

      <Section title="How we use information">
        <p>
          We use information to create payment links, route checkout flows, verify payments, show balances and dashboards, prevent duplicate records, troubleshoot failed payments, improve reliability, and respond to support requests.
        </p>
      </Section>

      <Section title="Third-party providers">
        <p>
          Hash PayLink may rely on Privy, Circle, wallet providers, RPC providers, block explorers, hosting providers, analytics or logging tools, and supported blockchain networks. These providers may process data according to their own policies.
        </p>
      </Section>

      <Section title="Storage and retention">
        <p>
          Some payment and account-linking records may be stored to keep checkout, dashboard, and smart wallet flows working. Public blockchain and decentralized storage records cannot usually be deleted by Hash PayLink.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Hash PayLink uses provider authentication, wallet signatures, and server-side checks where needed. You are responsible for securing your email account, wallet, devices, and recovery methods.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For privacy or support questions, contact <a href="mailto:support@hashpaylink.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@hashpaylink.com</a>.
        </p>
      </Section>
    </DocPage>
  )
}
