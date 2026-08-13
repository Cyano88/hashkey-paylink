export type CirclePocketCapability =
  | 'wallet-overview'
  | 'send-usdc'
  | 'deposit-usdc'
  | 'swap-usdc'
  | 'receive-usdc'
  | 'bank-payout'
  | 'retail-pos'
  | 'bills'
  | 'receipts'
  | 'profile-support'

export type CirclePocketRoute = {
  source: 'hashpaylink-backend-router'
  capability: CirclePocketCapability
  supported: boolean
  confidence: 'high' | 'medium' | 'fallback'
  answer: string
  action: { label: string; url: string }
}

const ROUTES: Record<CirclePocketCapability, Omit<CirclePocketRoute, 'source' | 'capability' | 'supported' | 'confidence'>> = {
  'wallet-overview': {
    answer: 'Pocket keeps balances, USDC transfers and requests, bank payouts, POS, bills, and payment history in one place.',
    action: { label: 'Open Pocket', url: 'https://pocket.hashpaylink.com/home' },
  },
  'send-usdc': {
    answer: 'Send USDC to a Pocket ID or wallet address. Pocket confirms the recipient, network, amount, and available balance before payment.',
    action: { label: 'Send USDC', url: 'https://pocket.hashpaylink.com/home/send' },
  },
  'deposit-usdc': {
    answer: 'Deposit shows your receiving address for each supported network so you can fund Pocket safely.',
    action: { label: 'Deposit USDC', url: 'https://pocket.hashpaylink.com/home/deposit' },
  },
  'swap-usdc': {
    answer: 'Swap moves USDC between supported Pocket networks after you review the route and amount.',
    action: { label: 'Open Swap', url: 'https://pocket.hashpaylink.com/home/swap' },
  },
  'receive-usdc': {
    answer: 'I can prepare a USDC request after you confirm the payer, amount, purpose, network, and receiving Pocket wallet.',
    action: { label: 'Receive USDC', url: 'https://pocket.hashpaylink.com/move/usdc' },
  },
  'bank-payout': {
    answer: 'Receive to Bank creates a Naira request: confirm the payer, NGN amount, purpose, and signed-in verified payout account. The payer pays Base USDC and the bank account receives settlement.',
    action: { label: 'Receive to Bank', url: 'https://pocket.hashpaylink.com/move/bank' },
  },
  'retail-pos': {
    answer: 'Retail POS creates a reusable contactless terminal QR. Confirm the merchant name, settlement choice, and receiving wallet or verified bank account before creation.',
    action: { label: 'Open Retail POS', url: 'https://pocket.hashpaylink.com/move/pos' },
  },
  bills: {
    answer: 'Bills starts with Nigerian Airtime. Sign in, choose a mobile network, review the live Naira-to-USDC quote, and pay from your Base Circle Pocket wallet when the protected pilot is enabled.',
    action: { label: 'Open Bills', url: 'https://pocket.hashpaylink.com/bills/airtime' },
  },
  receipts: {
    answer: 'Receipts and wallet activity show payment status, transaction proof, and the history available for your signed-in account.',
    action: { label: 'View Receipts', url: 'https://pocket.hashpaylink.com/activity' },
  },
  'profile-support': {
    answer: 'Open Pocket to review your verified profile and account details. Locked bank-name or payment issues can be handed to a human support specialist here.',
    action: { label: 'Open Profile', url: 'https://pocket.hashpaylink.com/profile' },
  },
}

function result(capability: CirclePocketCapability, confidence: CirclePocketRoute['confidence'] = 'high'): CirclePocketRoute {
  return { source: 'hashpaylink-backend-router', capability, supported: true, confidence, ...ROUTES[capability] }
}

export function routeCirclePocketQuestion(question: string, helperMode: string): CirclePocketRoute | undefined {
  if (helperMode !== 'circle-pocket') return undefined
  const value = question.trim().replace(/\s+/g, ' ').toLowerCase()
  if (/\b(?:i am|i'm|im|already|currently)\s+(?:signed|logged)\s+in\b|\bmy account is (?:signed|logged) in\b/.test(value)) {
    return { ...result('profile-support'), answer: 'Got it. I will use the active signed-in session for Circle Pocket context; every secure wallet or payment action still verifies that session before it runs.' }
  }
  if (/\b(receipt|refund|history|transaction|proof|status|tx hash|confirmation)\b/.test(value)) return result('receipts')
  if (/\b(bank|naira|ngn|account number|settlement|payout|paycrest|zenith)\b/.test(value) || value.includes('\u20a6')) return result('bank-payout')
  if (/\b(pos|point of sale|contactless|merchant|static qr|retail|terminal|in[ -]?store)\b/.test(value) || /\bpos\s+checkout\b/.test(value)) return result('retail-pos')
  if (/\b(bills|airtime|mobile data|electricity|cable|utility|utilities)\b/.test(value)) return result('bills')
  if (/\b(swap|bridge|cross[ -]?chain|move between networks)\b/.test(value)) return result('swap-usdc')
  if (/\b(deposit|fund|top up|funding address)\b/.test(value)) return result('deposit-usdc')
  if (/\b(receive|paylink|pay link|payment link|request link|checkout link|request money|collect|get paid|payment request|invoice|charge|bill|raise|split|dues|donation|fundraiser)\b/.test(value)
    || /\b(?:request|charge|invoice|bill|collect|raise|ask)\b.*\b(?:usdc|usd|money|payment|pay|from)\b/.test(value)
    || /\b(?:create|generate|send|share)\b.*\b(?:paylink|pay link|payment link|request link|invoice)\b/.test(value)) return result('receive-usdc')
  if (/\b(profile|account|sign in|signin|verified|verification|email|support|error|stuck|failed|not working)\b/.test(value)) return result('profile-support', 'medium')
  if (/\b(send|transfer|withdraw)\b/.test(value)) return result('send-usdc')
  if (/\b(wallet|balance|network|pocket|circle smart)\b/.test(value)) return result('wallet-overview')
  if (/\b(what can you do|how can you help|capabilities|options|features)\b/.test(value)) return result('wallet-overview', 'medium')
  return {
    ...result('wallet-overview', 'fallback'),
    supported: false,
    answer: 'Pocket Support cannot complete that request directly yet. I can help with balances, deposits, sends, swaps, USDC requests, bank payouts, POS, bills, activity, receipts, or account support.',
  }
}
