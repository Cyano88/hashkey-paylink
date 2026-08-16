import { CapacitorHttp, type HttpResponse } from '@capacitor/core'
import { isPocketNativeRuntime, POCKET_ORIGIN } from './pocketRoutes'

const POCKET_API_PREFIX = `${POCKET_ORIGIN}/api/`
const ORIGINAL_FETCH = globalThis.fetch.bind(globalThis)
let installed = false

function isPocketApiRequest(url: string) {
  return url.startsWith(POCKET_API_PREFIX)
}

function requestHeaders(request: Request) {
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => { headers[key] = value })
  return headers
}

async function requestData(request: Request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const text = await request.clone().text()
  if (!text) return undefined
  if (request.headers.get('content-type')?.includes('application/json')) {
    try { return JSON.parse(text) as unknown }
    catch { return text }
  }
  return text
}

function responseBody(response: HttpResponse) {
  if (typeof response.data === 'string') return response.data
  if (response.data === undefined || response.data === null) return ''
  return JSON.stringify(response.data)
}

async function nativePocketFetch(request: Request) {
  if (request.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

  const pending = CapacitorHttp.request({
    url: request.url,
    method: request.method,
    headers: requestHeaders(request),
    data: await requestData(request),
    responseType: 'json',
  })

  const response = await new Promise<HttpResponse>((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    request.signal.addEventListener('abort', abort, { once: true })
    void pending.then(resolve, reason => {
      const message = reason instanceof Error ? reason.message : String(reason ?? '')
      if (/unable to resolve host|no address associated|failed to fetch|network(?:error| request failed)|enotfound/i.test(message)) {
        reject(new TypeError('Pocket could not connect. Check your connection and try again.'))
        return
      }
      reject(reason)
    }).finally(() => request.signal.removeEventListener('abort', abort))
  })

  return new Response(responseBody(response), {
    status: response.status,
    headers: response.headers,
  })
}

export function installPocketNativeFetch() {
  if (installed || !isPocketNativeRuntime()) return
  installed = true

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (!isPocketApiRequest(request.url)) return ORIGINAL_FETCH(input, init)
    return nativePocketFetch(request)
  }
}
