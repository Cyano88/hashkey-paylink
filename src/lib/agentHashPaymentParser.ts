export type PaymentCreationLane = 'usdc' | 'bank' | 'pos' | ''
export type PosSettlementChoice = 'KEEP_CRYPTO' | 'INSTANT_FIAT' | ''

export function extractPosSettlementChoice(text: string): PosSettlementChoice {
  const value = text.trim().toLowerCase()
  if (/\b(bank|naira|ngn|fiat|settle(?:ment)? to bank|bank settlement)\b/.test(value)) return 'INSTANT_FIAT'
  if (/\b(usdc|crypto|wallet|keep crypto|keep usdc|usdc settlement)\b/.test(value)) return 'KEEP_CRYPTO'
  return ''
}

export function extractPosTerminalName(text: string, existingName = '') {
  const explicit = text.match(/\b(?:called|named|for|call it|name it|rename(?: it)? to|change (?:the )?name to)\s+([\p{L}\p{M}\d][\p{L}\p{M}\d &'._-]{1,58}?)(?=\s+(?:with|using|settling|on)\b|[.!?]*$)/iu)?.[1]?.trim()
  if (explicit && !/^(?:bank|naira|ngn|usdc|crypto|wallet|pos|terminal)$/i.test(explicit)) return explicit
  if (existingName) return existingName
  const standalone = text.trim().replace(/[.!?]+$/, '')
  if (standalone.length < 2 || standalone.length > 60) return ''
  if (inferPaymentCreationLane(standalone) || extractPosSettlementChoice(standalone) || isPaymentCreationConfirmIntent(standalone)) return ''
  if (/(?:0x[a-fA-F0-9]{40}|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b|\b(?:base|arc|solana|arbitrum|network|wallet|address)\b)/i.test(standalone)) return ''
  return standalone
}

export function extractPaymentAmount(text: string) {
  if (/\d,{2,}\d|\d,\d{1,2}(?=,|\D|$)|\d,\d{4,}/.test(text)) return ''
  const explicit = text.match(/(?:\$|usdc\s+)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)|((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)\s*(?:usdc|usd)\b/i)
  const explicitValue = explicit?.[1] || explicit?.[2] || ''
  if (explicitValue) return explicitValue.replace(/,/g, '')
  if (/(?:\$|usdc\s+)[\d,]+|[\d,]+\s*(?:usdc|usd)\b/i.test(text)) return ''
  const loose = Array.from(text.matchAll(/(^|[^\w.])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)(?!x|\w)/gi))
  return (loose.find(match => Number(match[2].replace(/,/g, '')) > 0)?.[2] ?? '').replace(/,/g, '')
}

export function extractNairaPaymentAmount(text: string) {
  const prefix = text.match(/(?:₦|ngn\s*)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/i)?.[1]
  const suffix = text.match(/\b((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(?:naira|ngn)\b/i)?.[1]
  const raw = (prefix || suffix || '').replace(/,/g, '')
  const amount = Number(raw)
  return Number.isFinite(amount) && amount > 0 ? String(amount) : ''
}

export function isPaymentRequestIntent(text: string) {
  if (/\b(airtime|data bundle|mobile data|electricity|cable|dstv|gotv|utility|utilities|pay (?:my|the|a) bills?)\b/i.test(text)) return false
  return /\b(request|collect|charge|invoice|bill|raise|paylink|pay link|payment link|request link|checkout link|receive (?:a )?payments?|get paid|ask .*?(?:pay|send)|split|dues|donation|group collection|contribution|fundraiser|fundraising|create .*?(?:link|request)|generate .*?(?:link|request)|send .*?(?:paylink|payment link|request link))\b/i.test(text)
    || /\b(?:need|want|would like)\s+(?:to\s+)?(?:receive|collect|request)\b/i.test(text)
    || /\b(?:someone|client|customer|friend|payer|[A-Z][\p{L}\p{M}'-]{1,40})\s+(?:to\s+)?pay\s+(?:me\s+)?\d/iu.test(text)
}

export function inferPaymentCreationLane(text: string): PaymentCreationLane {
  const value = text.trim().toLowerCase()
  const paymentRequest = isPaymentRequestIntent(text)
  if (/\b(pos|point of sale|contactless|terminal|merchant qr|static qr|in[ -]?store)\b/.test(value)
    && (paymentRequest || /\b(create|make|open|start|setup|set up|need|want)\b/.test(value))) return 'pos'
  if (/\b(receive to bank|bank receive|bank payout|settle(?:ment)? to (?:my |a |the )?bank|payout account|account number)\b/.test(value)) return 'bank'
  if (paymentRequest && (/\b(naira|ngn)\b/.test(value) || value.includes('₦'))) return 'bank'
  if (paymentRequest && /\busdc\b/.test(value)) return 'usdc'
  if (/\b(direct usdc|usdc paylink|usdc payment link|crypto paylink|receive usdc|pay (?:me )?in usdc|base usdc|solana usdc)\b/.test(value)) return 'usdc'
  if (/^(?:direct|direct paylink|direct payment link)[.!?]*$/.test(value)) return 'usdc'
  if (/^(?:use |create |make |choose |the )?(?:direct )?(?:usdc|wallet)(?: paylink| payment link| link)?[.!?]*$/.test(value)) return 'usdc'
  if (/^(?:use |create |make |choose |the )?(?:receive to bank|bank|naira)(?: paylink| payment link| link)?[.!?]*$/.test(value)) return 'bank'
  if (/^(?:use |create |make |choose |the )?(?:pos|contactless|terminal)(?: qr| terminal| link)?[.!?]*$/.test(value)) return 'pos'
  return ''
}

export function isOutboundTransferIntent(text: string) {
  return /\b(?:send|pay|transfer|move)\s+(?:₦|ngn\s*)?[\d,]+(?:\.\d{1,6})?\s*(?:usdc|usd|naira|ngn)?\s+to\s+[@\p{L}\p{M}]/iu.test(text)
    && !isPaymentRequestIntent(text)
}

export function isPaymentFlowCancelIntent(text: string) {
  return /^(?:cancel|stop|discard)(?:\s+(?:it|this|the|current))?(?:\s+(?:draft|paylink|payment request))?[.!?]*$/i.test(text.trim())
    || /^(?:start over|restart|reset)(?:\s+(?:it|this|the|current))?(?:\s+(?:draft|paylink|payment request))?[.!?]*$/i.test(text.trim())
}

export function isNewPaymentFlowIntent(text: string) {
  return /^(?:create |make |start )?(?:a )?new\s+(?:paylink|payment link|payment request)[.!?]*$/i.test(text.trim())
}

export function isPaymentCreationConfirmIntent(text: string) {
  return /^(?:yes|yep|yeah|confirm|confirmed|create it|make it|generate it|send it|go ahead|looks good|proceed|continue)[.!?]*$/i.test(text.trim())
}

export function isStandalonePaymentPurposeReply(text: string) {
  const value = text.trim()
  if (!value || value.length > 80 || /[?]/.test(value)) return false
  if (isPaymentRequestIntent(value) || inferPaymentCreationLane(value)) return false
  if (isPaymentCreationConfirmIntent(value) || isPaymentFlowCancelIntent(value) || isNewPaymentFlowIntent(value)) return false
  return !/(?:0x[a-fA-F0-9]{40}|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b|\b(?:base|arc|solana|arbitrum|network|wallet|address)\b|\d)/i.test(value)
}
