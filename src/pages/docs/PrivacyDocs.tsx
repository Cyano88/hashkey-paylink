import { DocPage, DocHeader, Section, InfoBox } from './components'

const linkClass = 'text-blue-600 hover:underline dark:text-blue-400'

export default function PrivacyDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Privacy Policy"
        description="How Hash PayLink and Pocket collect, use, disclose, retain, and protect information."
        badge="Last updated August 19, 2026"
      />

      <InfoBox type="info">
        Hash PayLink does not ask for or store your seed phrase or private key. Pocket PIN entry and biometric verification are designed so that raw secrets and biometric templates are not received by Hash PayLink.
      </InfoBox>

      <Section title="1. Scope and controller">
        <p>
          This Policy applies to Hash PayLink websites, documentation, APIs, payment links, hosted or agentic checkouts, dashboards, merchant and POS tools, support tools, and the Pocket mobile or web application (together, the Services).
        </p>
        <p>
          Hash PayLink is the controller for personal data where it decides why and how that data is processed. Independent wallet, payment, hosting, bank, biller, blockchain, and support providers may act as processors or as separate controllers under their own policies.
        </p>
      </Section>

      <Section title="2. Information you provide">
        <p>
          Depending on the feature, you may provide an email address, name, Pocket ID, profile and local-currency preference, support messages, payment notes, recipient details, merchant or developer information, and records needed to create or manage a payment request or checkout.
        </p>
        <p>
          Bank and bill flows may include country, bank and account details, verified account name, refund account, beneficiary details, telephone number, network operator, data package, television smartcard, electricity meter, biller, customer reference, amount, and payment purpose.
        </p>
        <p>
          If you contact Agent Hash or human support, we process the messages, attachments or transaction references you choose to send and the conversation context needed to respond.
        </p>
      </Section>

      <Section title="3. Account, wallet, transaction, and device data">
        <p>
          We may process a Privy user identifier, verified email, authentication and session status, linked Circle wallet identifiers and addresses, supported network, balances requested for display, payment approvals, transaction hashes, idempotency references, quotes, fees, rates, provider references, receipts, request state, refund state, and activity timestamps.
        </p>
        <p>
          Pocket may process app version, platform, notification preference, Firebase installation or push token, device-registration timestamps, connectivity status, crash or server-error context, and local recovery state used to prevent a submitted operation from being repeated.
        </p>
        <p>
          Pocket stores only a protected verifier for its app PIN where server verification is required; it does not store the raw PIN. Fingerprint or facial templates remain under the Android or iOS device security system. The app receives only the result of the device biometric check.
        </p>
      </Section>

      <Section title="4. Information collected automatically or from others">
        <p>
          Servers and hosting providers may generate IP address, request time, route, response status, device or browser type, security event, rate-limit, and diagnostic logs. We may receive wallet and transaction data from Circle, blockchains, RPC providers and block explorers; quote, beneficiary and payout status from Paycrest; bill catalogue and fulfilment status from VTpass or billers; and notification-delivery data from Firebase.
        </p>
        <p>
          Merchants, developers, payers, recipients, support staff, or integration partners may provide information connected with a request, checkout, receipt, payout, webhook, support case, or dispute.
        </p>
      </Section>

      <Section title="5. Why we process information">
        <p>
          We use information to authenticate users; create and connect user-controlled wallets; display balances; route, authorise and reconcile payments; verify beneficiaries; obtain quotes; fulfil bills; maintain requests, activity and receipts; prevent duplicate execution; send selected notifications; provide support; detect abuse; secure the Services; enforce limits; meet legal obligations; and improve reliability.
        </p>
        <p>
          The lawful basis depends on the processing: performing our agreement with you, your consent (including optional notifications), compliance with legal obligations, and legitimate interests such as fraud prevention, security, reconciliation, service reliability, and support. You may withdraw consent where consent is the basis, but this does not affect earlier lawful processing.
        </p>
        <p>
          We do not sell personal data for money or use payment details for third-party targeted advertising.
        </p>
      </Section>

      <Section title="6. Providers and disclosures">
        <p>Information is disclosed only as needed for the selected feature, including to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Privy</strong>, for email authentication and identity sessions;</li>
          <li><strong>Circle</strong>, for user-controlled wallets, USDC balances, transaction authorisation, broadcasting, indexing, and wallet sessions;</li>
          <li><strong>Paycrest and participating providers</strong>, for FX quotes, bank verification, payout routing, liquidity, settlement, reversals, and refunds;</li>
          <li><strong>VTpass, billers, and network operators</strong>, for bill validation and fulfilment;</li>
          <li><strong>Google Firebase</strong>, for device registration and push-notification delivery;</li>
          <li><strong>Render and other infrastructure providers</strong>, for hosting, databases, durable records, security, and logs;</li>
          <li><strong>blockchains, RPC providers, block explorers, and decentralised storage</strong>, for public transaction execution and verification;</li>
          <li><strong>support, communications, and AI providers</strong>, when needed to answer a request or operate Agent Hash; and</li>
          <li><strong>professional advisers, regulators, law enforcement, or a successor organisation</strong>, where required by law, necessary to protect rights and security, or connected with a legitimate business transfer.</li>
        </ul>
        <p>
          Relevant provider notices include the <a className={linkClass} href="https://www.privy.io/privacy-policy" target="_blank" rel="noreferrer">Privy privacy policy</a>, <a className={linkClass} href="https://www.circle.com/legal/privacy-policy" target="_blank" rel="noreferrer">Circle privacy policy</a>, <a className={linkClass} href="https://www.paycrest.io/terms-of-use" target="_blank" rel="noreferrer">Paycrest terms and privacy disclosures</a>, <a className={linkClass} href="https://vtpass.com/privacy-policy" target="_blank" rel="noreferrer">VTpass privacy policy</a>, <a className={linkClass} href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">Firebase privacy information</a>, and the <a className={linkClass} href="https://render.com/privacy" target="_blank" rel="noreferrer">Render privacy policy</a>.
        </p>
      </Section>

      <Section title="7. Public blockchain and recipient information">
        <p>
          Blockchain transactions are public. Wallet addresses, token amounts, transaction hashes, timestamps, smart-contract interactions, network fees, and related data can be permanently visible to anyone through the network and block explorers. Hash PayLink cannot erase or rewrite a confirmed public blockchain record.
        </p>
        <p>
          Do not put confidential or unnecessary personal information in public wallet memos, payment notes, URLs, QR codes, receipts, or decentralised-storage content. If you provide another person's bank, bill, wallet, or contact details, you must have authority to do so and give them any notice required by law.
        </p>
      </Section>

      <Section title="8. Notifications and device permissions">
        <p>
          If you enable notifications, Pocket registers a device token with Firebase and Hash PayLink so it can send important payment, request, receipt, service, security, downtime, or product-change messages. Notification content can be visible on a lock screen according to device settings.
        </p>
        <p>
          You can disable notifications in Pocket or Android or iOS settings. Disabling them stops future optional delivery to that registration but does not remove transaction or activity records. We do not use a biometric permission to obtain your fingerprint or face image.
        </p>
      </Section>

      <Section title="9. Agent Hash and support conversations">
        <p>
          Agent Hash may use account context and prior support information to answer questions and prepare an action. Messages may be processed by automated-model or support providers. Do not include a PIN, OTP, seed phrase, private key, wallet password, or unrelated sensitive information.
        </p>
        <p>
          We may retain conversation context and support references to serve returning users, investigate incidents, and continue a case. Automated responses are not used as the sole basis for a payment; applicable confirmation and security checks remain required.
        </p>
      </Section>

      <Section title="10. Local app storage">
        <p>
          Pocket and Hash PayLink may use cookies, IndexedDB, secure device credentials, and local or session storage for authentication, theme outside the light-only sign-in page, wallet-session recovery, biometric preference, submitted-operation recovery, notification preference, idempotency, and performance caches.
        </p>
        <p>
          Clearing app or browser data removes local state and may require sign-in, wallet reconnection, or security setup again. It does not cancel a submitted transaction or erase server, provider, or blockchain records.
        </p>
      </Section>

      <Section title="11. Retention">
        <p>
          We retain account and profile information while needed to provide the Services. Transaction, payout, bill, checkout, receipt, reconciliation, fraud-prevention, and support records are retained for the period reasonably necessary to complete the transaction, prevent duplicates, resolve disputes, maintain security, and meet legal, accounting, or provider obligations.
        </p>
        <p>
          Device push registrations are retained until disabled, unregistered, expired, or no longer needed. Temporary operation-recovery data is cleared after the app can safely determine the submitted result. Backups and provider systems may take additional time to age out. Public blockchain and decentralised records may be permanent.
        </p>
      </Section>

      <Section title="12. Account deletion">
        <p>
          You can permanently delete your Pocket account in the app from Profile, Delete account. If you cannot access the app, use the public <a className={linkClass} href="/docs/account-deletion">account deletion page</a> to request deletion without reinstalling Pocket.
        </p>
        <p>
          Deletion removes your Pocket profile and Pocket ID association, saved wallet links, push registrations, Pocket PIN verifier, and Agent Hash account memory. It does not reverse completed payments, delete provider records that must be retained, or erase public blockchain data.
        </p>
      </Section>

      <Section title="13. Security">
        <p>
          We use measures such as provider authentication, access tokens, encrypted transport, wallet ownership checks, idempotency keys, server-side validation, restricted credentials, protected device storage, PIN verifiers, biometric-gated credentials, rate limits, and reconciliation controls. No system is completely secure.
        </p>
        <p>
          Protect your email, device and recovery methods; use a device lock; verify recipients; install updates from trusted sources; and report suspected compromise promptly. Hash PayLink support will never ask for your OTP, raw Pocket PIN, seed phrase, private key, or wallet password.
        </p>
      </Section>

      <Section title="14. International processing">
        <p>
          Hash PayLink and its providers may process information in countries other than where you live. Those locations may have different data-protection rules. We use contractual, provider, security, and other safeguards appropriate to the service and applicable law.
        </p>
      </Section>

      <Section title="15. Your privacy rights">
        <p>
          Depending on applicable law, including the Nigeria Data Protection Act 2023, you may request confirmation and access, correction, deletion, restriction, objection, portability where applicable, information about recipients and retention, or withdrawal of consent. You may also complain to the Nigeria Data Protection Commission or another competent authority.
        </p>
        <p>
          Some requests may be limited where information must be retained for a transaction, legal obligation, security investigation, provider dispute, or the rights of another person. We may need to verify your identity before acting. Public blockchain data cannot be deleted by Hash PayLink.
        </p>
      </Section>

      <Section title="16. Children">
        <p>
          The Services are not intended for anyone under 18, and we do not knowingly create accounts for children. Contact us if you believe a child has provided personal data.
        </p>
      </Section>

      <Section title="17. Changes and contact">
        <p>
          We may update this Policy as the Services, providers, or legal requirements change. The last-updated date identifies the current version, and material changes may also be announced in the app or through another appropriate channel.
        </p>
        <p>
          To ask a privacy question or exercise a right, email <a href="mailto:support@hashpaylink.com" className={linkClass}>support@hashpaylink.com</a>. Nigeria residents may also contact the <a className={linkClass} href="https://ndpc.gov.ng" target="_blank" rel="noreferrer">Nigeria Data Protection Commission</a>.
        </p>
      </Section>
    </DocPage>
  )
}
