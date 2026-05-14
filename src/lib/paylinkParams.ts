export function getPaylinkParam(params: URLSearchParams, longKey: string, shortKey: string) {
  return params.get(shortKey) ?? params.get(longKey) ?? ''
}

export function hasPaylinkFlag(params: URLSearchParams, longKey: string, shortKey: string) {
  return params.get(shortKey) === '1' || params.get(longKey) === '1'
}

export function isTelegramSourceParam(params: URLSearchParams) {
  return params.get('src') === 't' || params.get('source') === 'telegram'
}

export function setPaylinkParam(params: URLSearchParams, shortKey: string, value?: string | null) {
  const clean = value?.trim()
  if (clean) params.set(shortKey, clean)
}
