import {MARKETPLACE_WITHDRAWAL_MINIMUMS} from '../../lib/marketplaceWithdrawalPolicy'
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
  <Section title="How payments and withdrawals work" id="withdrawals">
    <ol className="list-decimal space-y-3 pl-5"><li><strong>You set the split.</strong> Send the seller shares and your marketplace commission. Hash PayLink records those exact amounts after verifying the buyer?s payment.</li><li><strong>Funds stay in holding.</strong> Pending means the payment is awaiting finality or your delivery-based release. Release makes the balance available; it does not send a payout.</li><li><strong>Each recipient withdraws their own balance.</strong> Your app requests the payout through the API. The seller cannot spend your commission, and you cannot withdraw a seller?s share as commission.</li><li><strong>Show Processing until settlement is confirmed.</strong> Reserved funds cannot be withdrawn again. Reaching a minimum does not trigger an automatic payout.</li></ol>
    <p><strong>Withdrawal minimums, not purchase minimums:</strong> wallet withdrawals must deliver at least {MARKETPLACE_WITHDRAWAL_MINIMUMS.wallet.amount} USDC on Base. Bank withdrawals must convert at least {MARKETPLACE_WITHDRAWAL_MINIMUMS.bank.amount} USDC to NGN. Applicable fees are additional and shown in the quote.</p>
    <p>Apply the minimum separately to each seller and your marketplace commission. Your commission percentage does not impose a minimum order size. For example, a 1 USDC order with a 10% commission credits 0.90 USDC to the seller and 0.10 USDC to the marketplace. The commission remains visible below the withdrawal minimum.</p>
    <p>After release, label a small balance <strong>Available ? below withdrawal minimum</strong>, not Pending. Pending describes a release restriction; a payout minimum is a separate condition. Refunds are not subject to withdrawal minimums.</p>
    <p><strong>Accumulated withdrawals are still being built.</strong> Balances already total across orders, but the current pilot can only reserve a payout from one order allocation. Combining those balances into one withdrawal and choosing bank or wallet at withdrawal time are not yet available. The current pilot binds a destination to each allocation; Marketplace NGN payouts remain gated.</p>
  </Section>
  <Section title="Availability before integration">
    <p>Register your Marketplace Payments app, select the product and request whitelist review. Individual developers can qualify with current Basic or Advanced identity verification. Businesses require approved business verification. Admin approval and explicit pilot activation are also required.</p>
    <p>Marketplace financial endpoints are not yet open for production or sandbox integration. The private pilot uses a dedicated Base USDC holding wallet, not smart-contract escrow. USDT, Marketplace bank payouts and combined withdrawals across orders are not yet available. Approval does not automatically activate them.</p>
  </Section>
  <Section title="Seller balances in your product" id="balances">
    <p>Your app shows each seller?s balance and your marketplace?s commission separately. Sellers do not need a separate Hash PayLink dashboard.</p>
    <ul className="list-disc space-y-2 pl-5"><li><strong>Pending:</strong> payment received but awaiting finality or your release. Pending funds cannot be spent.</li><li><strong>Available:</strong> released funds, including amounts below a withdrawal minimum.</li><li><strong>Reserved:</strong> funds already committed to a payout or refund. They cannot be spent again while the outcome is unresolved.</li></ul>
    <p>Finality does not automatically release seller funds. Your marketplace must confirm its delivery conditions and request release. A return URL or browser redirect is not proof of payment.</p>
  </Section>
  <Section title="Planned integration sequence" id="integration">
    <ol className="list-decimal space-y-3 pl-5"><li>Register verified recipients.</li><li>Create an order with exact seller shares and your commission. They must add up to the order total.</li><li>Wait for verified payment before showing received funds.</li><li>Authorize release when your delivery conditions are met.</li><li>When a recipient requests withdrawal, obtain a fixed, expiring payout quote and approve its destination, fees and received amount.</li><li>Use authenticated status and signed webhooks to confirm the final outcome.</li></ol>
  </Section>
  <Section title="Refunds, fees and retries" id="refunds">
    <p><strong>At checkout:</strong> the buyer pays the order amount, Hash PayLink processing fee and collection gas reimbursement. Your marketplace commission is part of the order split, not an extra Hash PayLink fee.</p>
    <p><strong>At withdrawal:</strong> the withdrawing recipient covers the disclosed network fee and, for bank payouts, provider fees. The quote shows the total balance debit and exact amount received. A changed quote requires new approval. Bank conversion uses the current quoted rate.</p>
    <p><strong>For refunds:</strong> return the approved amount to the verified original buyer in the original asset. Refunds do not have a withdrawal minimum. Already-paid allocations cannot be reversed by editing a balance.</p>
    <p>The marketplace must fund a separate refund-fee reserve from its released commission. This covers refund gas without reducing the buyer?s approved refund. Seller funds cannot fund this reserve.</p>
    <p>Use the same idempotency key to retry the same instruction. A timeout is not proof of failure: check status before retrying or releasing reserved funds. Receipts show the confirmed amount and applicable fees.</p>
  </Section>
  <Section title="API contract status">
    <p>Select <Code>marketplace_payments</Code> for this product. Integration examples will be published as each route completes its acceptance checks. Ordinary checkout settles immediately and must not be used as a substitute for Marketplace holding and release.</p>
  </Section>
  <NavFooter prev={{label:'Checkout API',path:'/docs/api'}} next={{label:'Polymarket funding',path:'/docs/funding'}}/>
</DocPage>}
