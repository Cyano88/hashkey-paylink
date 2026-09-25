# @hashpaylink/sdk

React button and URL helpers for Hash PayLink hosted checkout.

Hash PayLink is stateless and non-custodial. The SDK does not hold funds, run wallet logic, or duplicate the production relayer path. It builds clean checkout URLs for the current Hash PayLink app.

```bash
npm install @hashpaylink/sdk
```

```tsx
import { PayLinkButton, buildPayLinkUrl } from '@hashpaylink/sdk'

export function InvoiceButton() {
  return (
    <PayLinkButton
      recipientEVM="0xYourMerchantAddress"
      network="base"
      amount="25"
      memo="Invoice #042"
    />
  )
}

const url = buildPayLinkUrl({
  recipientEVM: '0xYourMerchantAddress',
  recipientSolana: 'YourSolanaAddress',
  amount: '10',
  multiChain: true,
  memo: 'Order #1001',
})
```

Current public networks: `base`, `arbitrum`, `solana`, and `arc`.

Useful exports:

- `PayLinkButton`
- `buildPayLinkUrl`
- `SUPPORTED_NETWORKS`
- `CHAIN_META`
- `isValidEvmAddress`
- `isLikelySolanaAddress`
- `isValidUsdcAmount`

### xStocks share-based Trade checkout

Import `createXStocksAgreementClient` and `xStocksCheckoutUrl` from
`@hashpaylink/sdk/xstocks` in your server code. Create drafts with
`kind: 'trade'` and `stockCustody: 'xstocks-shares-v2'`, plus exact quantity strings,
accepted Trade details, participant IDs and a stable idempotency key. Return only
the hosted URL and public receipt data to your UI; never expose the developer key.
The feature is unavailable until the share-based factory is activated. Existing
agreements retain their original custody version. Receipt integer strings must
not be converted through JavaScript Number.
