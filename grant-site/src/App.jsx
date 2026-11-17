import React from "react";

const Arrow = () => <svg className="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>;
const Mark = () => <img className="brand-symbol" src="/pitch/hash-logo.png" alt="" />;

function Header() {
  return <header className="header">
    <a className="brand" href="#top"><Mark />Hash PayLink</a>
    <nav aria-label="Main navigation"><a href="#product">Product</a><a href="#evidence">Traction</a><a href="#readiness">Readiness</a></nav>
    <a className="button small" href="#funding">Funding plan <Arrow /></a>
  </header>;
}

function Flow() {
  return <div className="flow-card">
    <div className="flow-top"><b>How the money moves</b><span>Arc route proposed, not live</span></div>
    <div className="flow-main">
      <div className="flow-node"><small>INFRASTRUCTURE</small><strong>Circle</strong><span>USDC + wallet tools</span></div>
      <Arrow />
      <div className="flow-node focus"><small>PRODUCT + ROUTING</small><strong>Hash PayLink</strong><span>Pocket · checkout · APIs</span></div>
      <Arrow />
      <div className="destinations">
        <div className="destination"><i className="dot grey" /><div><b>Base</b><small>Current cash balance destination</small></div><em>Today</em></div>
        <div className="destination proposed"><i className="dot blue" /><div><b>Arc</b><small>Proposed cash balance destination</small></div><em>Grant-backed</em></div>
      </div>
    </div>
    <div className="provider-line"><b>Licensed local providers</b><Arrow /><span>Bank payouts · bills · travel eSIM</span></div>
    <p className="flow-note">Providers carry the local payment and service legs. Hash PayLink connects those routes to the product.</p>
  </div>;
}

function Products() {
  return <section className="section" id="product">
    <div className="section-head split"><div><p className="eyebrow">ONE PRODUCT LAYER</p><h2>One app. A payment gateway. A way to build.</h2></div><p>Hash PayLink connects stablecoin balances to payment experiences people and businesses already understand.</p></div>
    <div className="product-grid">
      <article className="product"><span className="index">01 / POCKET</span><div className="pocket-art"><span /></div><h3>Money tools for people</h3><p>Pocket brings stablecoin balances together with local bank transfers, bills, travel eSIM and other supported services.</p><small>One app for cross-border money and everyday use</small></article>
      <article className="product"><span className="index">02 / HASH PAYLINK</span><div className="checkout-art"><span className="checkout-brand"><Mark /> Hash PayLink</span><b>Choose how to pay</b><span className="option">● &nbsp;USDC <em>Continue</em></span><span className="option">↗ &nbsp;Local payment <em>Continue</em></span><small>Global payments with stablecoins.</small></div><h3>Online and in-person checkout</h3><p>Merchants can accept stablecoin payments through hosted checkout, payment links and a reusable business QR.</p><small>A checkout customers can understand at a glance</small></article>
      <article className="product"><span className="index">03 / DEVELOPERS</span><div className="portal-art"><aside><i /><i /><i /><i /></aside><div><b>Production access</b><span /><span /><span /><em>Business review</em></div></div><h3>Built for integration</h3><p>The developer portal asks businesses for registration and operational evidence before production access.</p><small>Admin review before a business goes live</small></article>
    </div>
  </section>;
}

function Evidence() {
  return <section className="section evidence" id="evidence">
    <div className="section-head"><p className="eyebrow">WHAT THE DASHBOARDS SHOW</p><h2>Early use, with the context intact.</h2><p>Account growth is a real signal. On-chain settlement activity is another; the source and limits of each metric stay visible.</p></div>
    <div className="evidence-grid">
      <article className="evidence-card">
        <div className="evidence-head"><div><span className="source"><i className="privy-dot" /> PRIVY | USERS</span><h3>42 active accounts</h3></div><span className="period">18 Oct - 17 Nov 2026</span></div>
        <div className="metrics"><div><strong>42</strong><span>Active, excluding 3 CEO test accounts</span></div><div><strong>135</strong><span>Total, excluding 3 CEO test accounts</span></div></div>
        <div className="new-users"><b>39 new users</b><span>Raw Privy count; overlap with test accounts in this period is unverified.</span></div>
        <figure className="privy-shot"><img src="/pitch/privy-users-dashboard.png" alt="Privy Users dashboard showing 45 active, 39 new and 138 total users from 18 October to 17 November 2026" /><figcaption>Raw dashboard values: 45 active | 39 new | 138 total. Three CEO test accounts were excluded from active and all-time totals.</figcaption></figure>
        <p className="fine-print">Account counts do not establish completed customer payments, paying customers or signed pilots.</p>
      </article>
      <article className="evidence-card defi-card">
        <div className="evidence-head"><div><span className="source"><i className="circle-dot" /> DEFILLAMA | ON-CHAIN FEES</span><h3>Cumulative fees reported by DefiLlama</h3></div><span className="period">Cumulative | 17 Nov 2026</span></div>
        <div className="defi-total"><strong>$2,315</strong><span>cumulative fees tracked by DefiLlama</span></div>
        <div className="defi-method"><span>DefiLlama states a 0.2% platform fee on successful settlements.</span><a href="https://defillama.com/protocol/hash-paylink" target="_blank" rel="noreferrer">View DefiLlama data and methodology <span aria-hidden="true">&#8599;</span></a></div>
        <div className="defi-caveat"><b>Fee total, not transaction volume.</b> DefiLlama also notes that some sponsored payments may include gas recovery. Its page does not identify user type, so external-customer activity and team/test activity are not separated.</div>
      </article>
    </div>
  </section>;
}

function Readiness() {
  return <section className="section readiness" id="readiness">
    <div className="section-head"><p className="eyebrow">BUILT WITH CLEAR ROLES</p><h2>Product in place. The next step is production readiness.</h2></div>
    <Flow />
    <div className="readiness-grid">
      <article><i className="status mint">01</i><div><h3>Working product surfaces</h3><p>Pocket, hosted online checkout, business QR checkout and developer onboarding are part of the current product.</p></div></article>
      <article><i className="status blue">02</i><div><h3>Arc route needs support</h3><p>Arc is proposed as the cash balance destination. Integration, liquidity reserves and provider settlement capacity remain grant-backed work.</p></div></article>
      <article><i className="status gold">03</i><div><h3>Security and compliance work</h3><p>Circle has offered an Encode security audit; Hash PayLink is completing the application. Legal review of AML, data protection and licensing is ongoing.</p></div></article>
      <article><i className="status grey">04</i><div><h3>Focused market entry</h3><p>Nigeria first, with Uganda and Kenya on the licensing roadmap. Mid-December 2026 is a target, conditional on funding, provider readiness and compliance closeout.</p></div></article>
    </div>
    <p className="readiness-note">Bridge-powered US virtual account funding and liquidation are in discussion, not live. WalletConnect has offered a partnership for external wallet payments; that route is not live.</p>
  </section>;
}

function Funding() {
  return <section className="funding" id="funding">
    <div className="funding-inner">
      <div className="funding-copy"><p className="eyebrow light">THE GRANT UNLOCK</p><h2>Move from a working product to a ready local payment network.</h2><p>Support would turn the proposed Arc route into production work and help prepare the reserves and controls required for launch.</p></div>
      <div className="funding-list">
        <div><span>01</span><b>Arc integration</b><small>Make Arc the proposed cash balance destination alongside Circle-powered USDC flows.</small></div>
        <div><span>02</span><b>Liquidity and settlement</b><small>Prepare reserves for local payouts, bills and travel eSIM through licensed providers.</small></div>
        <div><span>03</span><b>Reliable infrastructure</b><small>Support RPC capacity, wallet operations, monitoring and production service delivery.</small></div>
        <div><span>04</span><b>Security and launch readiness</b><small>Complete the Encode audit process and close priority compliance work with counsel.</small></div>
        <div><span>05</span><b>Launch marketing and early retention</b><small>Planned launch-day USD 100 total Pocket Gifts pool for Nigerian creators to raffle codes to followers; target the first 1,000 sign-ups and measure repeat use.</small></div>
      </div>
      <a className="button inverse" href="#close">See the plan <Arrow /></a>
    </div>
  </section>;
}

function Close() {
  return <footer className="close" id="close">
    <div className="close-head"><div><p className="eyebrow">A CLEAR NEXT STEP</p><h2>Bring stablecoin payments closer to everyday commerce.</h2></div><a className="button" href="#top">Back to overview <Arrow /></a></div>
    <p className="close-copy">Hash PayLink is building the product layer between digital dollars, merchants and licensed local payment providers. Circle and Arc support can help us take the next route from proposal to production.</p>
    <div className="footer-line"><a className="brand footer-brand" href="#top"><Mark />Hash PayLink</a><span>Circle + Arc grant update · November 2026</span><span>Global payments with stablecoins.</span></div>
  </footer>;
}

export function App() {
  return <main id="top"><div className="hero-shell"><Header /><section className="hero">
    <div className="hero-copy"><p className="eyebrow hero-eyebrow"><i /> CIRCLE + ARC GRANT UPDATE · NOVEMBER 2026</p><h1>Stablecoin payments, connected to everyday commerce.</h1>
      <p className="hero-lede">Hash PayLink brings stablecoin checkout, QR payments and local money services into one product layer—for people, merchants and developers.</p>
      <div className="hero-state"><div><i className="state-dot blue" /><span><b>Today</b><small>Base is the current cash balance destination.</small></span></div><div><i className="state-dot cyan" /><span><b>Proposed with grant</b><small>Arc as the cash balance destination.</small></span></div></div>
      <a className="button" href="#funding">See what the grant unlocks <Arrow /></a>
    </div>
    <figure className="hero-image"><div><img src="/pitch/xpay-website-checkout.jpeg" alt="Customer scanning a Hash PayLink QR checkout at a retail counter" /></div><figcaption><b><i /> Hash PayLink QR checkout</b><span>One QR. Payment options in Pocket.</span></figcaption></figure>
    <div className="hero-flow"><span>Circle infrastructure</span><Arrow /><span>Hash PayLink products</span><Arrow /><span>Licensed local providers</span></div>
  </section></div><Products /><Evidence /><Readiness /><Funding /><Close /></main>;
}

