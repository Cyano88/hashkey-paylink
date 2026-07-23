export type NigerianMobileNetwork = 'mtn' | 'airtel' | 'glo' | 'etisalat'

// Original allocations published by the Nigerian Communications Commission.
// Mobile number portability means this is a helpful default, not proof of the
// subscriber's current network. The selector must always remain overridable.
const NETWORK_PREFIXES: Record<NigerianMobileNetwork, ReadonlySet<string>> = {
  mtn: new Set(['0703', '0704', '0706', '0707', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916']),
  airtel: new Set(['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0911', '0912']),
  glo: new Set(['0705', '0805', '0807', '0811', '0815', '0905', '0915']),
  etisalat: new Set(['0809', '0817', '0818', '0908', '0909']),
}

export function normalizeNigerianMobileNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('234') && digits.length === 13) return `0${digits.slice(3)}`
  if (digits.length === 10 && !digits.startsWith('0')) return `0${digits}`
  return digits
}

export function detectNigerianMobileNetwork(value: string): NigerianMobileNetwork | null {
  const phone = normalizeNigerianMobileNumber(value)
  if (!/^0\d{10}$/.test(phone)) return null
  const prefix = phone.slice(0, 4)
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES) as Array<[NigerianMobileNetwork, ReadonlySet<string>]>) {
    if (prefixes.has(prefix)) return network
  }
  return null
}

export function mobileNetworkServiceId(network: NigerianMobileNetwork, category: 'airtime' | 'data') {
  return category === 'data' ? `${network}-data` : network
}
