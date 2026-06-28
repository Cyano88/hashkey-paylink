import assert from 'node:assert/strict'

const blockedPayerNames = new Set([
  'request',
  'payment',
  'paylink',
  'invoice',
  'buy',
  'send',
  'receive',
  'confirm',
  'continue',
  'use',
  'base',
  'arc',
  'solana',
  'arbitrum',
  'her',
  'him',
  'them',
])

function normalizeHelperName(value) {
  return value
    .trim()
    .replace(/^@+/, '')
    .replace(/[.?!,;:]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 48)
}

function extractNetwork(text) {
  const lower = text.toLowerCase()
  if (/\barc\b/.test(lower)) return 'arc'
  if (/\bsolana\b|\bsol\b/.test(lower)) return 'solana'
  if (/\barbitrum\b|\barb\b/.test(lower)) return 'arbitrum'
  if (/\ball networks\b|\bany network\b|\bbase and solana\b/.test(lower)) return 'all'
  if (/\bbase\b|\bevm\b/.test(lower)) return 'base'
  return ''
}

function extractWallet(text) {
  const evm = text.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? ''
  if (evm) return evm
  return text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/)?.[0] ?? ''
}

function extractPayerCorrection(text) {
  const match = text.match(/\b(?:change|update|correct|set)?\s*(?:payer(?: name)?|her name'?s?|her name is|his name'?s?|his name is|their name'?s?|their name is)\s*(?:to|is|=|:)?\s+(@?[a-zA-Z][\w.-]{1,40})\b/i)?.[1] ?? ''
  const clean = normalizeHelperName(match)
  return clean && !blockedPayerNames.has(clean.toLowerCase()) ? clean : ''
}

function cleanRelationshipName(value) {
  return value
    .replace(/\s+\b(?:and\s+i|and\s+we|i\s+want|i\s+need|who|that|she|he|they|for)\b.*$/i, '')
    .trim()
}

function extractRelationshipMemory(text) {
  const match = text.match(/\b(?:i have|my)\s+(?:a\s+|an\s+)?(friend|sister|brother|mother|father|partner|client|customer|payer|colleague)\s+(?:called|named|is)\s+(@?[a-zA-Z][\w .-]{1,40})/i)
  if (!match) return null
  const name = normalizeHelperName(cleanRelationshipName(match[2]))
  return name ? { relation: match[1].toLowerCase(), name } : null
}

function walletMatchesNetwork(wallet, network) {
  if (!wallet || !network || network === 'all') return true
  if (network === 'solana') return !wallet.startsWith('0x')
  return wallet.startsWith('0x')
}

function stripWallets(text) {
  return text
    .replace(/0x[a-fA-F0-9]{40}/g, '')
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanPaymentPurpose(value) {
  return stripWallets(value)
    .replace(/\b\d+(?:\.\d{1,6})?\s*(?:usdc|usd)\b/gi, '')
    .replace(/\b(?:base|arc|solana|arbitrum|all networks?|any network|evm|usdc)\b/gi, '')
    .replace(/\b(?:to|from)\s+@?[a-zA-Z][\w.-]{1,40}\b/gi, '')
    .replace(/\b(?:payment|paylink|request)\s+(?:is\s+)?(?:for\s+)?/gi, '')
    .replace(/\b(?:the\s+)?only details?.*$/i, '')
    .replace(/\b(?:then\s+)?give me .*$/i, '')
    .replace(/^(?:for|purpose|memo|reason)\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, '')
    .trim()
    .slice(0, 80)
}

function cleanCollectionLabel(value) {
  return cleanPaymentPurpose(value)
    .replace(/\b(?:group|collection|fundraiser|fundraising|contributors|contribution|contributions)\b/gi, '')
    .replace(/\b(?:from|with)\s+\d+\s+(?:people|friends|contributors|payers)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, '')
    .trim()
    .slice(0, 80)
}

function extractCollectionLabel(text) {
  const clean = stripWallets(text).replace(/\s+/g, ' ').trim()
  const match = clean.match(/\b(?:group donation|group collection|collection|fundraiser|fundraising|donation|dues|split)\s+(?:for|called|named|to|towards?)\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? clean.match(/\b(?:collect|raise)\s+(?:\d+(?:\.\d{1,6})?\s*(?:usdc|usd)\s+)?(?:from\s+[^?.!,;]+?\s+)?for\s+([^?.!,;]+)/i)?.[1]?.trim()
    ?? ''
  if (!match) return ''
  return cleanCollectionLabel(match)
}

function isGroupRequestIntent(text) {
  return /\b(group|collection|multi payer|multi-payer|everyone|split|dues|donation|fundraiser|fundraising|contributors|contribution|contributions|many people|from \d+\s+(?:people|friends|contributors|payers))\b/i.test(text)
}

function describeMissingDraftFields(draft, savedWallet = '') {
  return [
    draft.mode !== 'group' && !draft.target && 'payer name',
    draft.mode !== 'group' && !draft.amount && 'amount in USDC',
    !draft.network && !draft.wallet?.startsWith('0x') && 'network',
    !draft.label && 'purpose',
    !draft.wallet && !savedWallet && 'receive wallet',
  ].filter(Boolean)
}

assert.equal(extractPayerCorrection('change payer to Nana'), 'Nana')
assert.equal(extractPayerCorrection("her name's Nana"), 'Nana')
assert.equal(extractPayerCorrection('payer is buy'), '')
assert.equal(extractRelationshipMemory('I have a friend called Nana and I want to request 1000 USDC from her for tuition')?.name, 'Nana')
assert.equal(extractNetwork('She picked Solana'), 'solana')
assert.equal(extractNetwork('change network to Base'), 'base')
assert.equal(walletMatchesNetwork('0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce', 'solana'), false)
assert.equal(walletMatchesNetwork('Fe5bg5a394XukeyAYm8EiRj7xJsYX1bZ3vnavryUESyT', 'solana'), true)
assert.equal(extractWallet('change wallet to 0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce'), '0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce')
assert.equal(isGroupRequestIntent('create a group donation for my birthday'), true)
assert.equal(isGroupRequestIntent('collect from 10 people for class dues'), true)
assert.equal(extractCollectionLabel('create a group donation for my birthday'), 'my birthday')
assert.equal(extractCollectionLabel('collect 500 USDC from 10 people for class dues'), 'class dues')
assert.deepEqual(describeMissingDraftFields({ mode: 'group', target: '', amount: '', network: 'base', label: 'class dues', wallet: '0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce' }), [])
assert.deepEqual(describeMissingDraftFields({ mode: 'person', target: '', amount: '', network: 'base', label: 'tuition', wallet: '0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce' }), ['payer name', 'amount in USDC'])

console.log('agent hash payments parser smoke ok')
