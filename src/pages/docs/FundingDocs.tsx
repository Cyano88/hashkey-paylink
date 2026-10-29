import {DocPage,DocHeader,Section,SubSection,CodeBlock,InfoBox,NavFooter} from './components'
export default function FundingDocs(){return <DocPage><DocHeader title="Fund a Polymarket account" description="Create a hosted USDC funding checkout for an eligible customer's Polymarket wallet."/>
<InfoBox>This is a separate product from merchant checkout. Enable Polymarket funding on an approved project. Live Base and Arbitrum routes are supported; there is no funded sandbox. Check the API's current minimum before creating a request.</InfoBox>
      <Section title="Polymarket Funding API">
        <p>
          Enable <code>Polymarket funding</code> on a human-checkout USDC project. Your server supplies the customer's Polymarket wallet, amount and eligible project networks. Hash PayLink independently requests and verifies the provider deposit route; integrations cannot supply or override that destination.
        </p>
        <SubSection title="POST /api/v2/funding/polymarket/checkouts">
          <CodeBlock lang="bash">{`curl -X POST https://app.hashpaylink.com/api/v2/funding/polymarket/checkouts \
  -H "X-API-Key: YOUR_SERVER_KEY" \
  -H "Idempotency-Key: funding:your-unique-request-id" \
  -H "Content-Type: application/json" \
  -d '{
    "polymarketWallet": "0xCUSTOMER_WALLET",
    "amount": "25",
    "networks": ["base", "arbitrum"],
    "returnUrl": "https://your-allowlisted-domain.example/funding/complete"
  }'`}</CodeBlock>
          <p>The response includes a hosted <code>checkoutUrl</code>, stable <code>fundingRequestId</code>, and authenticated <code>statusUrl</code>. The payer can select from the requested networks that are also enabled on the developer project. Base and Arbitrum are supported in this provider flow.</p>
        </SubSection>
        <SubSection title="GET /api/v2/funding/polymarket/checkouts?id=pmf_...">
          <p>Poll this endpoint from your server with the same API key. <code>awaiting_payment</code> means no accepted checkout payment, <code>bridging</code> means payment was received but provider delivery is not final, and <code>funded</code> means the provider reports completed delivery. Only <code>funded</code> returns the receipt and allowlisted return URL. Never grant access or credit a customer from the generic <code>payment.confirmed</code> webhook alone for a provider-funded checkout.</p>
        </SubSection>
      </Section>


<Section title="Recover an unfinished request"><p>Save the fundingRequestId before redirecting. Reuse the same idempotency key if creation times out. Check the authenticated status URL after the customer returns and from a recovery job. Keep bridging requests pending; do not create a replacement payment while delivery is unresolved. Contact support with the funding request ID if the provider does not complete delivery.</p></Section>
<NavFooter prev={{label:'Checkout API',path:'/docs/api'}} next={{label:'Pocket wallet and payments',path:'/docs/pocket'}}/>
</DocPage>}
