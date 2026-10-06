import { DocPage, DocHeader, Section, SubSection, InfoBox, Code, Table, NavFooter } from './components'

export default function WalletsDocs() {
  return (
    <DocPage>
      <DocHeader
        title="Wallet Setup"
        description="Connect customer wallets and configure balances, xStocks market data and optional swaps."
      />

      <InfoBox type="tip">Pocket uses Circle wallet sessions for supported stablecoin flows and Privy embedded wallets for xStocks on X Layer. Read access never grants permission to spend.</InfoBox>

      <Section title="Balances, prices and swaps" id="xlayer-provider-setup">
        <p>Checkout, Agreements and Swap have separate project configuration. A balance card or price display does not enable Swap.</p>
        <Table headers={['Feature', 'Purpose', 'Access']} rows={[
          ['Wallet balances and holdings', 'Show the connected customer’s assets and balances', 'Customer-authorized, read-only wallet access'],
          ['xStocks prices', 'Show supported token prices and indicative portfolio value', 'Market-data access'],
          ['Swap', 'Request an asset conversion', 'Separate permission and customer approval'],
        ]} />
        <SubSection title="Build these features on your platform">
          <p>For your own balance cards, price displays or swap integration, obtain your own OKX Onchain OS API credentials and an X Layer RPC endpoint. Use the Web3 developer APIs, not exchange trading credentials.</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Create a project in the <a className="underline" href="https://web3.okx.com/onchainos/dev-portal">OKX Developer Portal</a>. Obtain an API key, secret and passphrase, and confirm access and quotas for the Balance, Market Price and, if needed, Trade APIs.</li>
            <li>Configure an <a className="underline" href="https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints">X Layer RPC</a> for chain <Code>196</Code>. The public endpoint is <Code>https://rpc.xlayer.tech</Code>; choose a dedicated endpoint for production capacity. X Layer gas uses OKB.</li>
            <li>Call OKX through your backend using its <a className="underline" href="https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage">request authentication</a>. Keep credentials and private RPC URLs in server secrets, never in browser code, mobile bundles or VITE variables.</li>
          </ol>
        </SubSection>
        <SubSection title="Choose the right data source">
          <p>Use the <a className="underline" href="https://web3.okx.com/onchainos/dev-docs/market/balance-total-token-balances">Balance API</a> for a holdings display where supported. Verify spendable token units and transaction receipts through RPC. Bind the wallet to your authenticated customer; a public address lookup does not prove ownership.</p>
          <p>Use the <a className="underline" href="https://web3.okx.com/onchainos/dev-docs/market/market-price">Market Price API</a> with chain index 196 and supported token contract addresses. These are on-chain token prices, not guaranteed sale proceeds or an exchange equity-price feed. Show freshness and unavailable prices explicitly; missing data must not appear as a zero balance.</p>
          <p>For your own swaps, verify pair availability, obtain a fresh executable quote, validate the chain, router, spender, recipient, amounts and slippage, and request customer approval before signing. Market-data credentials do not authorize spending.</p>
        </SubSection>
        <SubSection title="Using Hash PayLink’s hosted wallet features">
          <p>Our hosted stock-balance and Swap endpoints use Hash PayLink-managed providers. They require your scoped Hash PayLink key and the appropriate customer identity; you do not need to supply OKX credentials or an RPC for those endpoints. There is currently no project setting to upload your own provider keys.</p>
          <p><Code>POST /api/v2/wallets/stocks/balances</Code> requires <Code>wallet:stocks:read</Code>. Use the server-redeemed wallet connection for connected-account reads. <Code>POST /api/v2/wallets/swap-sessions</Code> requires <Code>wallet:swap</Code>, an enabled X Layer Swap capability and customer approval. Checkout or Agreements access alone does not grant Swap.</p>
          <p>Displaying an asset does not make it payable: the checkout or agreement must explicitly accept it. Standard checkout uses USDC. Separately activated human projects can accept configured X Layer assets through the same checkout API. Market data alone does not enable asset acceptance, conversion, or funding; xStocks are not supported for funding.</p>
        </SubSection>
      </Section>

      <Section title="Privy + Circle">
        <SubSection title="Arc agreements">
          <p>Arc agreement payers use email-first identity and Circle wallet sessions for authorized Arc actions. The authenticated wallet that funds an agreement becomes its payer authority.</p>
        </SubSection>
        <SubSection title="Agent and PolyDesk flows">
          <p>Agentic flows use selected paying agents, Circle wallet sessions, and x402-style service receipts where applicable. PolyDesk stores user preferences and alert settings server-side so Telegram sessions can persist.</p>
        </SubSection>
      </Section>

      <Section title="Connected wallets">
        <SubSection title="EVM">
          <p>Base, Arbitrum, and Arc Mainnet support EVM wallet addresses. Existing connected-wallet paths remain available where the checkout flow needs them.</p>
        </SubSection>
        <SubSection title="Solana">
          <p>Solana recipients use base58 public keys. Phantom and Solflare are common wallets for Solana USDC payments.</p>
        </SubSection>
      </Section>

      <Section title="Legacy manual-address checkout">
        <InfoBox type="warning">The older Send via Address checkout is not currently offered. Its backend implementation is retained for a possible future rollout if there is verified demand.</InfoBox>
      </Section>

      <Section title="Arc Mainnet setup">
        <p>For Arc Mainnet, add the network manually if your wallet does not detect it:</p>
        <ul className="list-none space-y-1 mt-2 font-mono text-xs text-gray-600 dark:text-gray-400">
          <li>Network name: <Code>Arc Mainnet</Code></li>
          <li>RPC URL: <Code>https://rpc.mainnet.arc.io</Code></li>
          <li>Chain ID: <Code>5042</Code></li>
          <li>Explorer: <Code>https://explorer.arc.io</Code></li>
        </ul>
      </Section>

      <NavFooter
        prev={{ label: 'Security', path: '/docs/security' }}
        next={{ label: 'Environment Variables', path: '/docs/environment' }}
      />
    </DocPage>
  )
}
