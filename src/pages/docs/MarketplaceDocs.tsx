import {MARKETPLACE_SETTLEMENTS} from '../../lib/marketplacePayments'
import {DocPage,DocHeader,Section,Code,NavFooter} from './components'

export default function MarketplaceDocs(){return <DocPage>
  <DocHeader badge="Under development" title="Marketplace Payments" description="Your marketplace manages sellers, orders, commissions and delivery conditions. Hash PayLink is building the payment infrastructure to hold allocations and execute authorized releases, payouts and refunds."/>
  <Section title="Choose wallet or bank account settlement" id="settlement">
    <p>Choose the settlement route before integrating. Each payment uses one stablecoin on Base; seller allocations and the marketplace commission remain in that asset.</p>
    <div className="grid gap-4">{MARKETPLACE_SETTLEMENTS.map(route=><article key={route.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><h3 className="font-semibold text-gray-950 dark:text-white">{route.title}: {route.label}</h3><p className="mt-2">{route.detail}</p><dl className="mt-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt>Funding asset</dt><dd>{route.asset} on Base</dd></div><div className="mt-2 flex flex-wrap justify-between gap-2"><dt>Recipient receives</dt><dd>{route.currency}</dd></div><div className="mt-2 flex flex-wrap justify-between gap-2"><dt>Destination</dt><dd>{route.destination}</dd></div></dl></article>)}</div>
    <p><strong>Cash balance means local NGN settlement.</strong> USDT goes to a Base wallet and cannot use this local route. There is no automatic USDC/USDT conversion. A payment containing an NGN bank allocation must therefore be funded in USDC.</p>
    <p>Wallet settlement describes the destination. It does not bypass the marketplace hold or release instruction.</p>
  </Section>
  <Section title="Availability before integration">
    <p>You can register a Marketplace Payments app and request whitelist review from Products. Approval records your eligibility for a private pilot; it does not activate payments. Marketplace financial endpoints are not yet open for production or sandbox integration. Existing Checkout and Polymarket Funding keys do not authorize marketplace collection, release, payout or refund.</p>
    <p>Individual developers can qualify with current Basic or Advanced identity verification. Businesses require approved business verification. Both require an active app, Marketplace selection, admin whitelist approval and explicit pilot activation. Verification and authorization are checked again before execution.</p>
    <p>The settlement rules and internal accounting foundation are implemented. A dedicated Base USDC holding wallet is configured; this is a holding-wallet service, not smart-contract escrow. Execution adapters, gas coverage and a funded end-to-end pilot still need verification. The first pilot is limited to USDC on Base; USDT settlement is planned. No funds are collected by this documentation preview.</p>
  </Section>
  <Section title="Seller balances in your product" id="balances">
    <p>Your marketplace displays seller balances using project-scoped records. USDC and USDT are separate balances, not a combined dollar wallet. Sellers do not need a separate Hash PayLink dashboard.</p>
    <ul className="list-disc space-y-2 pl-5"><li><strong>Pending:</strong> funded allocations awaiting your release instruction.</li><li><strong>Available:</strong> released amounts eligible for payout.</li><li><strong>Reserved:</strong> amounts committed to a payout or refund whose outcome is not final.</li></ul>
    <p>A displayed ledger balance must reconcile with actual held funds. An allocation or a payment-page redirect is not proof of collection.</p>
  </Section>
  <Section title="Planned integration sequence" id="integration">
    <ol className="list-decimal space-y-3 pl-5"><li>Register sellers and verified bank or Base-wallet destinations within your developer project.</li><li>Create a payment with one asset, seller allocations and an explicit platform commission. Their sum must equal the payment amount exactly.</li><li>Collect the buyer's authorized payment into the verified holding mechanism. Confirm funding on the server before crediting pending balances.</li><li>Send a release instruction when your own delivery conditions are met. Release makes funds available; it does not itself confirm a bank payout.</li><li>Request a payout. Wallet settlement sends the same asset; Cash balance requests a Paycrest quote and funds the NGN payout with USDC.</li><li>Reconcile final settlement through authenticated status and signed webhooks. Unknown outcomes remain reserved, not available to spend again.</li></ol>
  </Section>
  <Section title="Refunds, fees and retries" id="refunds">
    <p>A refund must identify the original payment and allocations, including any platform commission you are returning. Partial refunds cannot exceed remaining unspent allocations. Funds already paid out cannot be reversed by changing a ledger entry.</p>
    <p>USDC payments refund USDC; USDT payments refund USDT to the verified original payer. A bank-settlement preference does not change the original payment asset.</p>
    <p>The buyer pays Hash PayLink's processing fee and collection gas reimbursement on top of the order amount. The full order amount reaches holding and is divided into seller shares and the marketplace's own commission. The buyer reviews the quoted fee and total before authorizing payment. Collection gas does not cover later payouts or refunds.</p>
    <p>Platform commission and payment/provider fees are separate. NGN payout amounts depend on the accepted Paycrest quote, its fees and expiry. A stablecoin balance does not guarantee a fixed future naira amount.</p>
    <p>The pilot fee policy uses a fixed, expiring payout quote. The withdrawing seller or marketplace pays the disclosed network fee from its withdrawal. Wallet quotes show the total debit and exact USDC received; bank quotes also show the provider fee, exchange rate and exact NGN received. Hash PayLink does not add another processing commission at payout. A changed quote requires new authorization.</p>
    <p>Refunds return the approved buyer principal intact. The marketplace must explicitly fund a separate refund-fee reserve from its released USDC commission. Seller allocations cannot fund this reserve. Insufficient reserve pauses submission; successful refunds charge the quoted network fee, while definitively failed attempts restore the fee reservation. Initial reserve funding and funded live execution must be verified before pilot activation.</p>
    <p>Fee breakdowns are included in the internal status, webhook and receipt models. Public integration endpoints remain closed while the live pilot checks are completed.</p>
    <p>Every money-changing request will require a project-scoped idempotency key. A retry with the same key and different details must fail. Timeouts must be reconciled before retrying execution or making reserved funds available again.</p>
  </Section>
  <Section title="API contract status">
    <p>The planned capability identifier is <Code>marketplace_payments</Code>. Public endpoints and SDK integration examples will be published only after the complete collection, release, payout and refund lifecycle is ready. Do not use ordinary checkout's immediate settlement as a marketplace holding mechanism.</p>
  </Section>
  <NavFooter prev={{label:'Checkout API',path:'/docs/api'}} next={{label:'Polymarket funding',path:'/docs/funding'}}/>
</DocPage>}
