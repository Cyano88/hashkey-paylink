export type CirclePocketCapability =
  | 'wallet-overview'
  | 'receive-usdc'
  | 'bank-payout'
  | 'retail-pos'
  | 'bills'
  | 'x402-wallet'
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
    answer: 'Circle Pocket brings your smart-wallet balance, funding addresses, wallet activity, transfers, and supported networks into one place.',
    action: { label: 'Open Circle Pocket', url: '/pocket/home/smart-wallet' },
  },
  'receive-usdc': {
    answer: 'I can prepare that PayLink after you confirm the payer, amount, purpose, network, and whether to use your connected Circle Pocket wallet or another wallet.',
    action: { label: 'Receive USDC', url: '/pocket/move/usdc' },
  },
  'bank-payout': {
    answer: 'Receive to Bank creates a Naira request: confirm the payer, NGN amount, purpose, and signed-in verified payout account. The payer pays Base USDC and the bank account receives settlement.',
    action: { label: 'Receive to Bank', url: '/pocket/move/bank' },
  },
  'retail-pos': {
    answer: 'Retail POS creates a reusable contactless terminal QR. Confirm the merchant name, settlement choice, and receiving wallet or verified bank account before creation.',
    action: { label: 'Open Retail POS', url: '/pocket/move/pos' },
  },
  bills: {
    answer: 'Bills starts with Nigerian Airtime. Sign in, choose a mobile network, review the live Naira-to-USDC quote, and pay from your Base Circle Pocket wallet when the protected pilot is enabled.',
    action: { label: 'Open Bills', url: '/pocket/bills/airtime' },
  },
  'x402-wallet': {
    answer: 'The x402 wallet moves available USDC into a paid-service balance for supported agent and API access.',
    action: { label: 'Open x402 Wallet', url: '/pocket/home/x402' },
  },
  receipts: {
    answer: 'Receipts and wallet activity show payment status, transaction proof, and the history available for your signed-in account.',
    action: { label: 'View Receipts', url: '/pocket/activity' },
  },
  'profile-support': {
    answer: 'Open Circle Pocket to sign in, review your verified account, edit available profile details, and manage wallet services.',
    action: { label: 'Open Circle Pocket', url: '/pocket/home/smart-wallet' },
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
  if (/\b(x402|service balance|paid service|agent wallet|api access)\b/.test(value)) return result('x402-wallet')
  if (/\b(receive|paylink|pay link|payment link|request link|checkout link|request money|collect|get paid|payment request|invoice|charge|bill|raise|split|dues|donation|fundraiser)\b/.test(value)
    || /\b(?:request|charge|invoice|bill|collect|raise|ask)\b.*\b(?:usdc|usd|money|payment|pay|from)\b/.test(value)
    || /\b(?:create|generate|send|share)\b.*\b(?:paylink|pay link|payment link|request link|invoice)\b/.test(value)) return result('receive-usdc')
  if (/\b(profile|account|sign in|signin|verified|verification|email|support|error|stuck|failed|not working)\b/.test(value)) return result('profile-support', 'medium')
  if (/\b(wallet|balance|funding address|deposit|withdraw|send|transfer|network|circle pocket|circle smart)\b/.test(value)) return result('wallet-overview')
  if (/\b(what can you do|how can you help|capabilities|options|features)\b/.test(value)) return result('wallet-overview', 'medium')
  return {
    ...result('wallet-overview', 'fallback'),
    supported: false,
    answer: 'Circle Pocket does not handle that request directly yet. The closest available help is wallet management, receiving USDC, bank payout, Retail POS, bills, x402 funding, or receipts. Open Circle Pocket to choose the right flow.',
  }
}
