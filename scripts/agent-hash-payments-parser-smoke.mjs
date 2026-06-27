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

function walletMatchesNetwork(wallet, network) {
  if (!wallet || !network || network === 'all') return true
  if (network === 'solana') return !wallet.startsWith('0x')
  return wallet.startsWith('0x')
}

assert.equal(extractPayerCorrection('change payer to Nana'), 'Nana')
assert.equal(extractPayerCorrection("her name's Nana"), 'Nana')
assert.equal(extractPayerCorrection('payer is buy'), '')
assert.equal(extractNetwork('She picked Solana'), 'solana')
assert.equal(extractNetwork('change network to Base'), 'base')
assert.equal(walletMatchesNetwork('0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce', 'solana'), false)
assert.equal(walletMatchesNetwork('Fe5bg5a394XukeyAYm8EiRj7xJsYX1bZ3vnavryUESyT', 'solana'), true)
assert.equal(extractWallet('change wallet to 0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce'), '0xCEB57B0C27C47657C7B2f847196C953Fc7f155Ce')

console.log('agent hash payments parser smoke ok')
