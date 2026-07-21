import type { PocketDataVariation } from '../api/pocketBillsClient'

export type PocketDataBundleCategory = 'daily' | 'weekly' | 'monthly' | 'mega' | 'broadband'

export type PocketDataBundle = PocketDataVariation & {
  dataAmount: string
  validity: string
  price: number
  category: PocketDataBundleCategory
}

const MOBILE_DATA_SERVICE_IDS = new Set(['mtn-data', 'airtel-data', 'glo-data', 'etisalat-data'])

function titleCaseUnit(value: string, singular: string, plural: string) {
  const amount = Number(value)
  return `${value} ${amount === 1 ? singular : plural}`
}

function normalizeValidity(name: string) {
  const match = name.match(/(\d+)\s*[- ]?(hrs?|hours?|days?|months?|years?)/i)
  if (!match) {
    if (/\bdaily\b/i.test(name)) return '1 Day'
    if (/\bweekly\b/i.test(name)) return '7 Days'
    if (/\bmonthly\b/i.test(name)) return '30 Days'
    return 'Flexible'
  }
  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  if (unit.startsWith('hr') || unit.startsWith('hour')) {
    if (amount >= 24 && amount % 24 === 0) return titleCaseUnit(String(amount / 24), 'Day', 'Days')
    return titleCaseUnit(String(amount), 'Hour', 'Hours')
  }
  if (unit.startsWith('day')) return titleCaseUnit(String(amount), 'Day', 'Days')
  if (unit.startsWith('month')) return titleCaseUnit(String(amount), 'Month', 'Months')
  return titleCaseUnit(String(amount), 'Year', 'Years')
}

function validityDays(validity: string) {
  const match = validity.match(/^(\d+)\s+(Hour|Hours|Day|Days|Month|Months|Year|Years)$/)
  if (!match) return null
  const amount = Number(match[1])
  if (match[2].startsWith('Hour')) return amount / 24
  if (match[2].startsWith('Day')) return amount
  if (match[2].startsWith('Month')) return amount * 30
  return amount * 365
}

function normalizeDataAmount(name: string) {
  const matches = [...name.matchAll(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\b/gi)]
  if (!matches.length) {
    if (/unlimited/i.test(name)) return 'Unlimited'
    if (/smilevoice/i.test(name)) return 'Voice'
    if (/xtratalk/i.test(name)) return 'XtraTalk'
    return 'Data'
  }
  return matches
    .slice(0, 2)
    .map(match => `${match[1]} ${match[2].toUpperCase()}`)
    .join(' + ')
}

function dataAmountInGb(dataAmount: string) {
  return dataAmount.split('+').reduce((total, segment) => {
    const match = segment.trim().match(/^(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)$/i)
    if (!match) return total
    const amount = Number(match[1])
    const unit = match[2].toUpperCase()
    if (unit === 'TB') return total + amount * 1024
    if (unit === 'GB') return total + amount
    if (unit === 'MB') return total + amount / 1024
    return total + amount / (1024 * 1024)
  }, 0)
}

export function isPocketBroadbandService(serviceId: string) {
  return Boolean(serviceId) && !MOBILE_DATA_SERVICE_IDS.has(serviceId.toLowerCase())
}

export function parsePocketDataBundle(variation: PocketDataVariation, serviceId: string): PocketDataBundle {
  const dataAmount = normalizeDataAmount(variation.name)
  const validity = normalizeValidity(variation.name)
  const days = validityDays(validity)
  const volumeGb = dataAmountInGb(dataAmount)
  const mobileBroadbandPlan = MOBILE_DATA_SERVICE_IDS.has(serviceId.toLowerCase()) && (
    /\b(?:broadband|router|mifi|sme mobile data)\b/i.test(variation.name)
    || volumeGb >= 100
    || (days !== null && days > 45)
  )
  const category: PocketDataBundleCategory = isPocketBroadbandService(serviceId) || mobileBroadbandPlan
    ? 'broadband'
    : volumeGb >= 50 || (days !== null && days > 45)
      ? 'mega'
      : days !== null && days <= 2
        ? 'daily'
        : days !== null && days <= 14
          ? 'weekly'
          : days !== null && days <= 45
            ? 'monthly'
            : 'mega'

  return {
    ...variation,
    dataAmount,
    validity,
    price: Number(variation.amountNgn),
    category,
  }
}

export function parsePocketDataBundles(variations: PocketDataVariation[], serviceId: string) {
  return variations
    .filter(variation => !/\bvoice\b/i.test(variation.name))
    .map(variation => parsePocketDataBundle(variation, serviceId))
    .filter(bundle => Number.isFinite(bundle.price) && bundle.price > 0)
}
