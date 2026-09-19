import { DocPage, DocHeader, Section, InfoBox, Code, NavFooter } from './components'

export default function AccessMode() {
  return (
    <DocPage>
      <DocHeader badge="For Developers" title="Payment-gated access" description="Keep payment settlement, user authentication and archive evidence separate when granting access to a service." />
      <Section title="Legacy access links">
        <p>Historical access links include an event ID and payer label. These public values are not credentials and do not prove that the caller made a payment.</p>
        <InfoBox type="info">Do not grant access solely because <Code>/api/agent-verify</Code> returns <Code>verified: true</Code>. That legacy field indicates a matching archive event, not authenticated entitlement, original payment settlement or verified stored content.</InfoBox>
      </Section>
      <Section title="Before granting access">
        <ol className="list-decimal pl-5 space-y-2">
          <li>Authenticate the customer and associate the expected purchase with that customer on your server.</li>
          <li>Use the relevant payment API's documented final status, expected amount, token, network and recipient checks.</li>
          <li>Verify webhook signatures when using webhooks, and process each purchase idempotently.</li>
          <li>Grant the entitlement to the authenticated customer. Treat receipt and archive links as supporting evidence.</li>
        </ol>
        <p className="mt-3">For provider-funded checkouts, payment received can precede delivery. Follow the product-specific completion state before crediting the customer.</p>
      </Section>
      <Section title="Archive inspection">
        <p>The legacy archive lookup remains available for historical receipt inspection. Its response includes <Code>verificationScope: archive_event_only</Code>; settlement and payload verification are explicitly false because this lookup does not perform those checks.</p>
        <p className="mt-3">See the 0G Storage guide for historical root limitations and the separate evidence needed to verify archived content.</p>
      </Section>
      <NavFooter prev={{ label: '0G Storage', path: '/docs/0g-storage' }} next={{ label: 'API Endpoints', path: '/docs/api' }} />
    </DocPage>
  )
}
