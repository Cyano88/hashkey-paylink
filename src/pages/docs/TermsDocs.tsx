import { DocPage, DocHeader, Section, InfoBox } from './components'

const linkClass = 'text-blue-600 hover:underline dark:text-blue-400'

export default function TermsDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Terms and Conditions"
        description="Terms for Hash PayLink, Pocket, payment links, checkouts, payouts, bills, and connected services."
        badge="Last updated August 19, 2026"
      />

      <InfoBox type="info">
        Hash PayLink provides software and payment-routing interfaces. It does not take custody of your wallet keys or promise that a blockchain, bank, biller, liquidity provider, or other third party will complete a transaction.
      </InfoBox>

      <Section title="1. Agreement and scope">
        <p>
          These Terms apply when you access or use Hash PayLink websites, documentation, APIs, payment links, hosted or agentic checkouts, dashboards, merchant and POS tools, support tools, and the Pocket mobile or web application (together, the Services). By using a Service, you agree to these Terms and the Privacy Policy.
        </p>
        <p>
          You must be at least 18 years old, have legal capacity to enter this agreement, and use the Services only where permitted by the laws and third-party rules that apply to you. If you use the Services for an organisation, you confirm that you are authorised to bind it.
        </p>
      </Section>

      <Section title="2. What the Services do">
        <p>
          The Services can help users create and pay USDC requests, receive and send USDC, move supported balances between networks, create receipts, view activity, request or make local-currency bank payouts, purchase supported bills, use merchant or developer checkout tools, and communicate with support. Features, networks, currencies, limits, and providers vary by product and location.
        </p>
        <p>
          Pocket currently uses email identity, user-controlled wallets, a Pocket PIN, and optional device biometrics. Biometrics approve access through the device security system; they do not transfer ownership of the wallet or make Hash PayLink a custodian.
        </p>
      </Section>

      <Section title="3. User-controlled wallets and account security">
        <p>
          Supported wallet flows are provided through Circle and other wallet infrastructure. In user-controlled flows, you authorise wallet actions and remain responsible for your email account, Pocket PIN, device, biometric access, recovery methods, and wallet addresses. Hash PayLink does not ask for or store your seed phrase or private key.
        </p>
        <p>
          Never share an email one-time code, Pocket PIN, wallet password, recovery answer, private key, or seed phrase with staff or support. You must promptly report suspected unauthorised access and keep profile, beneficiary, and contact details accurate.
        </p>
      </Section>

      <Section title="4. Reviewing and authorising transactions">
        <p>
          Before confirming, check the recipient, network, token, amount, fee, exchange rate, bank or biller details, and payment purpose. A wallet address or bank account entered incorrectly may send value to the wrong recipient. Blockchain transactions can be irreversible after submission.
        </p>
        <p>
          Do not repeat a payment merely because a screen is slow or a receipt is still updating. Check Activity and the relevant transaction reference first. Hash PayLink may use idempotency controls and reconciliation records to prevent duplicate execution, but those controls cannot reverse a valid transaction already accepted by a network or provider.
        </p>
      </Section>

      <Section title="5. Statuses, receipts, reversals, and refunds">
        <p>
          A status describes the best information available from the wallet, blockchain, or provider at that time. Submitted, processing, pending, successful, paid, reversed, refunded, expired, and failed have different meanings. A Hash PayLink success state may confirm that the authorised USDC transfer reached the designated provider or recipient address; a bank or biller may still be completing its separate settlement step.
        </p>
        <p>
          If a provider does not complete within its expected window, the record may move to pending while reconciliation continues. A later provider result can update the same activity record to successful, reversed, or refunded. Refund timing and eligibility depend on the transaction route, network finality, provider rules, and the availability of a valid refund destination.
        </p>
        <p>
          Receipts are records of observed transaction information, not bank statements, guarantees of final settlement, or proof that a recipient has delivered goods or services.
        </p>
      </Section>

      <Section title="6. Bank payouts and local-currency services">
        <p>
          Local-currency quotes, beneficiary verification, payout routing, liquidity, and settlement may be provided through Paycrest and its independent provider network. Quotes can expire and may change with available liquidity. The displayed rate, fee, supported bank, minimum, maximum, and expected time apply only to that quote or payment attempt.
        </p>
        <p>
          You must have authority to use every beneficiary or refund account you provide. A verified account name only reports the provider response; it is not a guarantee against fraud, account restrictions, delays, or later rejection by a bank or provider.
        </p>
      </Section>

      <Section title="7. Bills and digital services">
        <p>
          Airtime, data, television, electricity, and related services may be fulfilled through VTpass, billers, network operators, and other providers. You are responsible for the telephone number, smartcard number, meter number, service, package, and amount submitted. Product availability and provider-enforced limits may change.
        </p>
        <p>
          Delivery can be delayed after payment. Where a bill cannot be fulfilled, its activity and refund status will update according to the provider response and the applicable payment route. Hash PayLink cannot manufacture a token, subscription, or airtime credit that the biller has not issued.
        </p>
      </Section>

      <Section title="8. Payment requests, links, POS, and checkouts">
        <p>
          A payment request, link, QR code, POS intent, or checkout does not guarantee payment. Creators and merchants are responsible for lawful descriptions, correct receiving details, fulfilment, refunds owed to customers, taxes, and disputes concerning their goods or services.
        </p>
        <p>
          Request and activity records can change from awaiting to accepted, paid, expired, reversed, or refunded as the same payment progresses. Do not treat an awaiting or accepted request as paid.
        </p>
      </Section>

      <Section title="9. Rates, fees, limits, and stablecoin risk">
        <p>
          Rates and fees shown in the Services are estimates or live provider quotes for the stated period. Network costs, liquidity, slippage, provider fees, and supported limits may change before execution. You will be shown the applicable amount or quote before authorising where the flow supports it.
        </p>
        <p>
          USDC is a third-party digital asset and is not a bank deposit with Hash PayLink. Its availability, redemption, transferability, and value depend on Circle, supported networks, market conditions, and applicable law. Hash PayLink does not provide investment, legal, tax, accounting, or financial advice.
        </p>
      </Section>

      <Section title="10. Third-party services">
        <p>
          The Services rely on independent providers, including Privy for authentication, Circle for wallet and USDC infrastructure, Paycrest for local-currency payout routing and quotes, VTpass and billers for bills, Firebase for device notifications, hosting and database providers, RPC providers, block explorers, blockchain networks, and support or AI infrastructure.
        </p>
        <p>
          Your use may also be subject to those providers' terms and policies, including the <a className={linkClass} href="https://www.privy.io/user-terms-of-service" target="_blank" rel="noreferrer">Privy terms</a>, <a className={linkClass} href="https://www.circle.com/legal" target="_blank" rel="noreferrer">Circle legal terms</a>, <a className={linkClass} href="https://www.paycrest.io/terms-of-use" target="_blank" rel="noreferrer">Paycrest terms</a>, and the applicable VTpass or biller terms. Hash PayLink does not control their eligibility rules, compliance checks, outages, settlement decisions, or geographic restrictions.
        </p>
      </Section>

      <Section title="11. Agent Hash and automated assistance">
        <p>
          Agent Hash and other automated features can explain product flows, prepare navigation or draft actions, and route support requests. Automated responses may be incomplete or incorrect. Review every result and payment detail yourself. The assistant must not be treated as financial, legal, tax, or emergency advice, and a payment still requires the applicable user confirmation and security approval.
        </p>
      </Section>

      <Section title="12. Prohibited use">
        <p>
          You must not use the Services for fraud, theft, money laundering, terrorist financing, sanctions evasion, unlawful gambling, illegal goods or services, unauthorised fundraising, phishing, impersonation, exploitation, abusive automation, interference with the Services, or any activity prohibited by law or a provider's acceptable-use rules.
        </p>
        <p>
          Hash PayLink may block, delay, limit, investigate, or stop access when reasonably necessary for security, legal compliance, provider requirements, suspected misuse, or protection of users and the Services. This does not give Hash PayLink control over an irreversible transaction already submitted to a third-party network.
        </p>
      </Section>

      <Section title="13. Availability and changes">
        <p>
          The Services are provided on an as-available basis. Maintenance, software defects, device conditions, internet loss, blockchain congestion, depleted liquidity, provider outages, or legal restrictions may interrupt a feature. Features marked beta, testnet, preview, or coming soon must not be relied on as production financial services.
        </p>
        <p>
          Hash PayLink may update, suspend, or discontinue a feature, network, provider, fee, or limit. Material changes to these Terms will be reflected by a new last-updated date and, where appropriate, an in-app or other notice.
        </p>
      </Section>

      <Section title="14. Disclaimers and responsibility">
        <p>
          To the maximum extent permitted by applicable law, the Services are provided without warranties that they will always be available, error-free, secure, or suitable for a particular purpose. Hash PayLink is not responsible for losses caused by incorrect details supplied by a user, compromised credentials, irreversible network execution, token or network failure, or an independent provider's action or omission.
        </p>
        <p>
          Nothing in these Terms excludes a right or liability that cannot lawfully be excluded. You remain responsible for taxes, reporting duties, licences, permissions, and legal obligations arising from your own use or business activity.
        </p>
      </Section>

      <Section title="15. Ending use">
        <p>
          You may stop using the Services and sign out at any time. Ending access does not cancel completed transactions, erase public blockchain records, or remove records that must be retained for security, reconciliation, dispute handling, or legal obligations. Terms concerning completed transactions, responsibility, disclaimers, and records survive termination where necessary.
        </p>
        <p>
          Pocket users can permanently delete their account from Profile, Delete account, or request deletion through the public <a className={linkClass} href="/docs/account-deletion">account deletion page</a>.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Questions, suspected unauthorised activity, and transaction support requests should be sent to <a href="mailto:support@hashpaylink.com" className={linkClass}>support@hashpaylink.com</a>. Include the support reference or transaction hash, but never send an OTP, Pocket PIN, biometric data, private key, seed phrase, or wallet password.
        </p>
      </Section>
    </DocPage>
  )
}
