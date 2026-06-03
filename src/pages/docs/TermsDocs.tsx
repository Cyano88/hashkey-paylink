import { DocPage, DocHeader, Section, InfoBox } from './components'

export default function TermsDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Terms and Conditions"
        description="Terms for using Hash PayLink to create and pay USDC payment links."
        badge="Last updated June 3, 2026"
      />

      <InfoBox type="info">
        Hash PayLink is non-custodial. Blockchain payments are sent directly by users through supported networks and wallet providers.
      </InfoBox>

      <Section title="Using Hash PayLink">
        <p>
          Hash PayLink lets users create payment links, receive USDC, and pay requests across supported networks. By using the app, you agree to use it only for lawful payments and to provide accurate payment details before creating or paying a link.
        </p>
        <p>
          You are responsible for checking the amount, recipient, network, and payment note before confirming a transaction. On-chain transactions may be irreversible once submitted.
        </p>
      </Section>

      <Section title="Non-custodial payments">
        <p>
          Hash PayLink does not hold user funds, control user wallets, or guarantee refunds. Funds move through smart contracts, wallet approvals, Circle smart wallet flows, or direct wallet/exchange transfers depending on the selected payment method.
        </p>
        <p>
          Platform fees, if applicable, are shown before payment and are deducted according to the payment flow shown in the app.
        </p>
      </Section>

      <Section title="Wallets and third-party services">
        <p>
          Hash PayLink may use third-party services such as Privy, Circle, wallet providers, RPC providers, block explorers, and supported blockchain networks. Those services may have their own terms, limits, fees, compliance rules, outages, or verification requirements.
        </p>
        <p>
          Hash PayLink is not responsible for wallet provider errors, network congestion, failed third-party services, incorrect wallet addresses, or restrictions imposed by those providers.
        </p>
      </Section>

      <Section title="No financial advice">
        <p>
          Hash PayLink provides payment infrastructure only. Nothing in the app is investment, legal, tax, accounting, or financial advice.
        </p>
      </Section>

      <Section title="Prohibited use">
        <p>
          Do not use Hash PayLink for fraud, sanctions evasion, money laundering, illegal goods or services, unauthorized fundraising, impersonation, phishing, or any activity that violates applicable law or the rules of supported third-party providers.
        </p>
      </Section>

      <Section title="Availability and changes">
        <p>
          Hash PayLink may change, pause, or remove features, supported networks, payment methods, fees, or integrations at any time. The service may be unavailable during maintenance, deploys, provider outages, or network disruption.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For support, contact <a href="mailto:support@hashpaylink.com" className="text-blue-600 dark:text-blue-400 hover:underline">support@hashpaylink.com</a>. Hash PayLink will never ask for your private key, seed phrase, or wallet password.
        </p>
      </Section>
    </DocPage>
  )
}
