import { DocPage, DocHeader, InfoBox, Section } from './components'

const linkClass = 'text-blue-600 hover:underline dark:text-blue-400'

export default function AccountDeletionDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Delete your Pocket account"
        description="Permanently remove your Pocket account and associated personal profile data."
        badge="Pocket by Hash PayLink"
      />
      <InfoBox type="warning">
        Account deletion is permanent. It does not reverse completed payments or erase public blockchain transactions.
      </InfoBox>
      <Section title="Delete from the Pocket app">
        <ol className="list-decimal space-y-2 pl-5">
          <li>Open Pocket and sign in.</li>
          <li>Open Profile, then choose Delete account.</li>
          <li>Review the deletion notice, type DELETE, and confirm.</li>
        </ol>
        <p>Your Pocket profile, Pocket ID association, saved wallet links, push registrations, Pocket PIN, and Agent Hash account memory are removed.</p>
      </Section>
      <Section title="Request deletion without the app">
        <p>
          Email <a className={linkClass} href="mailto:support@hashpaylink.com?subject=Pocket%20account%20deletion%20request">support@hashpaylink.com</a> from the email used for Pocket with the subject &quot;Pocket account deletion request.&quot; We will verify account ownership before completing the request. You do not need to reinstall or open the app.
        </p>
      </Section>
      <Section title="Records that may remain">
        <p>
          We may retain minimized transaction, payout, bill, receipt, reconciliation, dispute, fraud-prevention, security, and accounting records where needed to complete a transaction or meet legal, provider, or regulatory obligations. Confirmed public blockchain records cannot be changed or erased by Hash PayLink.
        </p>
        <p>See the <a className={linkClass} href="/docs/privacy">Privacy Policy</a> for more detail.</p>
      </Section>
    </DocPage>
  )
}
