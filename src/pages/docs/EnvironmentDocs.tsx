import {Link} from 'react-router-dom'
import {DocPage,DocHeader,Section,Code,Table,NavFooter} from './components'
export default function EnvironmentDocs(){return <DocPage>
<DocHeader title="Keys and environments" description="Keep payment credentials on your server and use the correct environment for testing."/>
<Section title="Two secrets, two jobs"><Table headers={['Server secret','Purpose']} rows={[
['HASHPAYLINK_API_KEY','Authenticates your project when creating checkouts and reading status. Create it under Developers → API keys.'],
['HASHPAYLINK_WEBHOOK_SECRET','Verifies notifications sent to your HTTPS webhook endpoint. Obtain it under Developers → Webhooks.']
]}/><p>Store these in your backend secret manager. Never put them in browser code, mobile bundles, public repositories or frontend environment variables. Your frontend calls your backend; your backend calls Hash PayLink.</p></Section>
<Section title="API origin"><p>Use <Code>https://app.hashpaylink.com</Code> for the documented checkout and funding endpoints. Configure projects at <a href="https://developer.hashpaylink.com" className="underline">developer.hashpaylink.com</a>. Save your website's HTTPS origin on the project before sending a return URL.</p></Section>
<Section title="Testing before live payment"><p>A funded human-checkout sandbox is not enabled. Test keys do not authorize mainnet payments. Use fixtures to test your server's signature verification, idempotency, timeouts, payment matching and delivery recovery.</p><p>A live end-to-end payment uses real funds, an approved project, enabled receiving routes and the payer's own approval. Use a separate payer account and a small agreed amount. Follow the <Link className="underline" to="/docs/getting-started#test">launch checklist</Link>.</p></Section>
<Section title="If a key is exposed"><p>Revoke the affected key in the dashboard, replace it in your server secrets and review recent activity. Never send a key or webhook secret to support. Include the project ID and relevant order or payment reference instead.</p></Section>
<NavFooter prev={{label:'Swap and bridge',path:'/docs/pocket/exchange'}} next={{label:'Payment security',path:'/docs/security'}}/>
</DocPage>}
