export type CirclePocketCapability =
  | 'wallet-overview'
  | 'send-usdc'
  | 'deposit-usdc'
  | 'swap-usdc'
  | 'receive-usdc'
  | 'payment-requests'
  | 'bank-payout'
  | 'retail-pos'
  | 'bills'
  | 'activity'
  | 'receipts'
  | 'rates'
  | 'spending-limits'
  | 'notifications'
  | 'payment-security'
  | 'human-support'
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
    answer: 'Pocket keeps your balances, USDC transfers, requests, bank payouts, POS, bills, and activity in one place.',
    action: { label: 'Open Pocket', url: '/home' },
  },
  'send-usdc': {
    answer: 'I can prepare a USDC send, but I will not sign or submit it without you. Enter the recipient Pocket ID or wallet address, network, and amount, then review and confirm inside Pocket.',
    action: { label: 'Send USDC', url: '/home/send' },
  },
  'deposit-usdc': {
    answer: 'Deposit shows your Pocket receiving address for each supported network so you can fund the correct wallet.',
    action: { label: 'Deposit USDC', url: '/home/deposit' },
  },
  'swap-usdc': {
    answer: 'Swap moves USDC between supported Pocket networks after you review the source, destination, and amount.',
    action: { label: 'Open Swap', url: '/home/swap' },
  },
  'receive-usdc': {
    answer: 'I can prepare a USDC payment request after you confirm the payer, amount, purpose, network, and receiving Pocket wallet.',
    action: { label: 'Request USDC', url: '/move/usdc' },
  },
  'payment-requests': {
    answer: 'Requests show the same payment as it moves from awaiting to accepted, paid, declined, expired, or reversed. Open Requests to review or act on the current state.',
    action: { label: 'Open Requests', url: '/activity/collections' },
  },
  'bank-payout': {
    answer: 'Direct bank payout sends Naira to a verified Nigerian bank account from available Pocket USDC. Pocket shows the live quote and requires your confirmation before submission.',
    action: { label: 'Bank payout', url: '/move/bank' },
  },
  'retail-pos': {
    answer: 'Retail POS creates a reusable contactless terminal QR after you confirm the merchant name and settlement destination.',
    action: { label: 'Open Retail POS', url: '/move/pos' },
  },
  bills: {
    answer: 'Pocket supports airtime, data, TV, and electricity. Choose the bill, review its amount and live USDC quote, then confirm the payment.',
    action: { label: 'Open Bills', url: '/bills/airtime' },
  },
  activity: {
    answer: 'Activity keeps your latest sends, receipts, requests, bill payments, bank payouts, POS collections, reversals, and refunds together.',
    action: { label: 'Open Activity', url: '/activity' },
  },
  receipts: {
    answer: 'Receipts show the truthful status and available transaction proof for your signed-in Pocket activity.',
    action: { label: 'View Receipts', url: '/activity' },
  },
  rates: {
    answer: 'Rates shows the current direct USDC-to-Naira quote used by Pocket. The quote refreshes from the live payout-rate source rather than a fixed estimate.',
    action: { label: 'View Rates', url: '/profile?feature=rates' },
  },
  'spending-limits': {
    answer: 'Spending limits shows Pocket limits and today’s tracked usage for bank payouts and bills. Product or available-liquidity limits may be lower at payment time.',
    action: { label: 'View Limits', url: '/profile?feature=limits' },
  },
  notifications: {
    answer: 'Notifications controls Android alerts for important Pocket updates, including relevant payment and service messages.',
    action: { label: 'Notification settings', url: '/profile?feature=notifications' },
  },
  'payment-security': {
    answer: 'Payment security manages your Pocket PIN and fingerprint or face approval. Secure payment confirmation still happens inside Pocket.',
    action: { label: 'Payment security', url: '/profile?feature=security' },
  },
  'human-support': {
    answer: 'Tell me what happened and I can open a secure Pocket Support case with the relevant account and payment context. Do not retry a payment that may already have been submitted.',
    action: { label: 'Pocket Support', url: '/assistant' },
  },
  'profile-support': {
    answer: 'Profile contains your verified identity, Pocket ID, rates, spending limits, notification settings, and payment security.',
    action: { label: 'Open Profile', url: '/profile' },
  },
}

function result(capability: CirclePocketCapability, confidence: CirclePocketRoute['confidence'] = 'high'): CirclePocketRoute {
  return { source: 'hashpaylink-backend-router', capability, supported: true, confidence, ...ROUTES[capability] }
}

function withAction(route: CirclePocketRoute, label: string, url: string) {
  return { ...route, action: { label, url } }
}

function sendRoute(question: string) {
  const route = result('send-usdc')
  const amount = question.match(/\b(\d+(?:\.\d+)?)\s*USDC\b/i)?.[1] ?? ''
  const evmAddress = question.match(/\b0x[a-fA-F0-9]{40}\b/)?.[0] ?? ''
  const recipientToken = question.match(/\bto\s+([1-9A-HJ-NP-Za-km-z]{32,44}|\d{6,12})\b/i)?.[1] ?? ''
  const recipient = evmAddress || recipientToken
  if (!recipient) return route
  const mode = /^\d{6,12}$/.test(recipient) ? 'pocket' : 'address'
  const explicitNetwork = question.match(/\b(base|arbitrum|solana)\b/i)?.[1]?.toLowerCase()
  const network = explicitNetwork || (mode === 'address' && !recipient.startsWith('0x') ? 'solana' : '')
  const params = [
    `recipient=${encodeURIComponent(recipient)}`,
    `mode=${mode}`,
    amount ? `amount=${encodeURIComponent(amount)}` : '',
    network ? `network=${network}` : '',
  ].filter(Boolean).join('&')
  return {
    ...route,
    answer: `I prepared this send inside Pocket${amount ? ` for ${amount} USDC` : ''}. Review the recipient${network ? ` and ${network} network` : ', network,'} then confirm; Agent Hash will not sign or submit it for you.`,
    action: { label: 'Review send', url: `/home/send?${params}` },
  }
}

type CirclePocketRouteContext = { memorySummary?: string }

function memoryRoute(question: string, memorySummary = ''): CirclePocketRoute | undefined {
  const value = question.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!memorySummary.trim()) return undefined
  const preferredName = memorySummary.match(/User prefers to be called ([^\n.]+)\.?/i)?.[1]?.trim()
  const relationships = [...memorySummary.matchAll(/User has an? ([^\n.]+?) called ([^\n.]+)\.?$/gim)]
  if (/\b(?:what do you remember|do you remember me|what do you know about me)\b/.test(value)) {
    const facts = [
      preferredName ? `your preferred name is ${preferredName}` : '',
      ...relationships.map(match => `${match[2].trim()} is your ${match[1].trim()}`),
    ].filter(Boolean)
    return {
      ...result('profile-support'),
      answer: facts.length
        ? `I remember that ${facts.join(' and ')}. I only retain details you explicitly ask Agent Hash to remember.`
        : 'I remember the preferences you explicitly shared with Agent Hash.',
    }
  }
  if (/\b(?:what(?:'s| is) my name|who am i)\b/.test(value) && preferredName) {
    return { ...result('profile-support'), answer: `You asked me to call you ${preferredName}.` }
  }
  const who = value.match(/\bwho is ([a-z][a-z '-]{0,60})[?.!]?$/i)?.[1]?.trim()
  const relationship = who ? relationships.find(match => match[2].trim().toLowerCase() === who) : undefined
  if (relationship) {
    return { ...result('profile-support'), answer: `${relationship[2].trim()} is the ${relationship[1].trim()} you asked me to remember.` }
  }
  return undefined
}
export function routeCirclePocketQuestion(question: string, helperMode: string, context: CirclePocketRouteContext = {}): CirclePocketRoute | undefined {
  if (helperMode !== 'circle-pocket') return undefined
  const remembered = memoryRoute(question, context.memorySummary)
  if (remembered) return remembered
  const value = question.trim().replace(/\s+/g, ' ').toLowerCase()
  if (/\b(?:i am|i'm|im|already|currently)\s+(?:signed|logged)\s+in\b|\bmy account is (?:signed|logged) in\b/.test(value)) {
    return { ...result('profile-support'), answer: 'Got it. I will use the active signed-in Pocket identity and its saved Agent Hash preferences. Every secure payment action still requires confirmation inside Pocket.' }
  }
  if (/\b(human|person|someone|agent|customer care|customer service|support case|complaint)\b/.test(value) && /\b(speak|talk|chat|contact|help|support|escalate)\b/.test(value)) return result('human-support')
  if (/\b(rate|rates|exchange rate|fx|usdc to naira|naira to usdc|conversion)\b/.test(value)) return result('rates')
  if (/\b(limit|limits|daily limit|per payment|spending|usage|used today|remaining today)\b/.test(value)) return result('spending-limits')
  if (/\b(notification|notifications|push|alert|alerts|bell)\b/.test(value)) return result('notifications')
  if (/\b(pin|fingerprint|biometric|face id|face unlock|payment security|reset pin)\b/.test(value)) return result('payment-security')
  if (/\b(receipt|refund|transaction proof|tx hash|confirmation)\b/.test(value)) return result('receipts')
  if (/\b(activity|history|transactions|money movement|status)\b/.test(value)) return result('activity')
  if (/\b(requests|request status|accepted request|paid request|declined request|expired request)\b/.test(value)) return result('payment-requests')
  if (/\b(bank|naira|ngn|account number|settlement|payout|beneficiary|zenith|opay)\b/.test(value) || value.includes('\u20a6')) return result('bank-payout')
  if (/\b(pos|point of sale|contactless|merchant|static qr|retail|terminal|in[ -]?store)\b/.test(value) || /\bpos\s+checkout\b/.test(value)) return result('retail-pos')
  if (/\b(data|mobile data|data bundle)\b/.test(value)) return withAction(result('bills'), 'Buy Data', '/bills/data')
  if (/\b(tv|cable|dstv|gotv|startimes)\b/.test(value)) return withAction(result('bills'), 'Pay TV', '/bills/tv')
  if (/\b(electricity|power|meter)\b/.test(value)) return withAction(result('bills'), 'Pay Electricity', '/bills/electricity')
  if (/\b(bills|airtime|utility|utilities)\b/.test(value)) return result('bills')
  if (/\b(swap|bridge|cross[ -]?chain|move between networks)\b/.test(value)) return result('swap-usdc')
  if (/\b(deposit|fund|top up|funding address)\b/.test(value)) return result('deposit-usdc')
  if (/\b(receive|paylink|pay link|payment link|request link|checkout link|request money|collect|get paid|payment request|invoice|charge|split|dues|donation|fundraiser)\b/.test(value)
    || /\b(?:request|charge|invoice|collect|raise|ask)\b.*\b(?:usdc|usd|money|payment|pay|from)\b/.test(value)
    || /\b(?:create|generate|share)\b.*\b(?:paylink|pay link|payment link|request link|invoice)\b/.test(value)) return result('receive-usdc')
  if (/\b(send|transfer|withdraw)\b/.test(value)) return sendRoute(question)
  if (/\b(profile|account|sign in|signin|verified|verification|email)\b/.test(value)) return result('profile-support', 'medium')
  if (/\b(error|stuck|failed|not working|missing|did not arrive|hasn't landed|has not landed)\b/.test(value)) return result('human-support', 'medium')
  if (/\b(wallet|balance|network|pocket|circle smart)\b/.test(value)) return result('wallet-overview')
  if (/\b(what can you do|how can you help|capabilities|options|features)\b/.test(value)) return result('wallet-overview', 'medium')
  return {
    ...result('wallet-overview', 'fallback'),
    supported: false,
    answer: 'I can help with Pocket balances, deposits, sends, swaps, requests, bank payouts, POS, bills, activity, receipts, rates, limits, notifications, payment security, and human support. Tell me the Pocket task you want to complete.',
  }
}
