const FRAME_ID = 'smile-identity-hosted-web-integration'
export const SMILE_FRAME_URL = 'https://hashkey-paylink.onrender.com/pocket/identity-frame'

export function openSmileFrame(config: Record<string, unknown>) {
  const origin = new URL(SMILE_FRAME_URL).origin
  if (window.location.origin === origin) throw new Error('Open identity verification in the Pocket app.')
  document.getElementById(FRAME_ID)?.remove()
  const frame = document.createElement('iframe')
  frame.id = frame.name = FRAME_ID
  frame.title = 'Smile ID identity verification'
  // Version the cached shell whenever the capture engine changes.
  const frameUrl = new URL(SMILE_FRAME_URL)
  frameUrl.searchParams.set('capture', 'v12-recovery-20260923')
  if (config.product === 'doc_verification') frameUrl.searchParams.set('method', 'government_id')
  frame.src = frameUrl.toString()
  frame.allow = 'camera; fullscreen'
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups')
  frame.referrerPolicy = 'no-referrer'
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:999999'
  let disposed = false, succeeded = false
  const notify = (key: string, value?: unknown) => { const callback = config[key]; if (typeof callback === 'function') callback(value) }
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    observer.disconnect()
    window.removeEventListener('message', receive)
    frame.remove()
  }
  const receive = (event: MessageEvent) => {
    if (disposed || event.origin !== origin || event.source !== frame.contentWindow) return
    const message = typeof event.data === 'string' ? event.data : event.data?.message
    if (typeof message !== 'string') return
    if (message === 'SmileIdentity::ChildPageReady') {
      clearTimeout(timer)
      frame.contentWindow?.postMessage(JSON.stringify({ ...config, source: 'SmileIdentity::Configuration' }), origin)
    } else if (message === 'SmileIdentity::Success' || message === 'SmileIdentity::Result') {
      if (!succeeded) { succeeded = true; notify('onSuccess') }
    } else if (message === 'SmileIdentity::Close' || message === 'SmileIdentity::Close::System') {
      dispose()
      if (message === 'SmileIdentity::Close') notify('onClose')
    } else if (message === 'SmileIdentity::Error' || message?.startsWith('SmileIdentity::ConsentDenied')) {
      const detail = typeof event.data === 'object' && event.data !== null ? event.data : null
      if (detail && message === 'SmileIdentity::Error') {
        // Submission errors belong to the provider screen. Preserve the capture and
        // the explicit close control instead of silently restarting the user.
        const status = Number.isInteger(detail.status) && detail.status >= 400 && detail.status <= 599 ? detail.status : null
        const errorCode = ['CONFIG_INVALID', 'SESSION_INIT_FAILED', 'CONSENT_DENIED', 'SUBMISSION_FAILED', 'NOT_PERMITTED', 'DOCUMENTS_REJECTED'].includes(detail.error_code) ? detail.error_code : 'SUBMISSION_FAILED'
        const failure = { status, errorCode, retryable: detail.retryable === true, message: typeof detail.error === 'string' ? detail.error.slice(0,300) : 'Verification could not be submitted.' }
        try {
          const fields = ['callback', 'consent', 'id_number', 'id_type', 'user_details', 'selfie', 'liveness', 'token', 'balance', 'signature', 'product', 'sdk', 'network'].filter(field => failure.message.toLowerCase().includes(field))
          sessionStorage.setItem('pocket:kyc-error:v1', JSON.stringify({ at: Date.now(), status, errorCode, retryable: failure.retryable, fields }))
        } catch { /* Diagnostics must not interrupt verification. */ }
        frame.contentWindow?.postMessage({ source: 'Pocket::SubmissionError', ...failure }, origin)
        notify('onError', { ...failure, frameOpen: true })
      } else {
        dispose(); notify('onError', { errorCode: message.includes('ConsentDenied') ? 'CONSENT_DENIED' : 'SESSION_INIT_FAILED', frameOpen: false })
      }
    }
  }
  const observer = new MutationObserver(() => { if (!frame.isConnected) dispose() })
  const timer = window.setTimeout(() => { dispose(); notify('onError') }, 30000)
  window.addEventListener('message', receive)
  document.body.prepend(frame)
  observer.observe(document.body, { childList: true })
}
