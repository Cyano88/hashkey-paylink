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

Supported networks: `base`, `arbitrum`, `solana`, `starknet`, `arc`, and `hashkey`.

Useful exports:

- `PayLinkButton`
- `buildPayLinkUrl`
- `SUPPORTED_NETWORKS`
- `CHAIN_META`
- `isValidEvmAddress`
- `isLikelySolanaAddress`
- `isValidStarknetAddress`
- `isValidUsdcAmount`
