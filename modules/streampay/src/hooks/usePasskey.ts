import { useCallback, useState } from 'react'

const CRED_KEY = 'sp_passkey_id'

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(s: string): ArrayBuffer {
  const bytes = Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0),
  )
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

export type PasskeyState = {
  credentialId: string | null
  registered:   boolean
  registering:  boolean
  error:        string | null
  register:     () => Promise<string | null>
  authenticate: () => Promise<boolean>
  reset:        () => void
}

export function usePasskey(): PasskeyState {
  const [credentialId, setCredentialId] = useState<string | null>(
    () => localStorage.getItem(CRED_KEY),
  )
  const [registering, setRegistering] = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const register = useCallback(async (): Promise<string | null> => {
    if (!window.PublicKeyCredential) {
      setError('Passkeys not supported — upgrade your browser or use HTTPS')
      return null
    }
    setRegistering(true)
    setError(null)
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const userId    = crypto.getRandomValues(new Uint8Array(16))

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp:   { name: 'StreamPay', id: window.location.hostname },
          user: {
            id:          userId,
            name:        'viewer@streampay',
            displayName: 'StreamPay Viewer',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7   }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification:        'required',
            residentKey:             'required',
          },
          timeout: 60_000,
        },
      }) as PublicKeyCredential | null

      if (!cred) return null
      const id = b64url(cred.rawId)
      localStorage.setItem(CRED_KEY, id)
      setCredentialId(id)
      return id
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/cancel|abort|dismiss/i.test(msg)) setError(msg)
      return null
    } finally {
      setRegistering(false)
    }
  }, [])

  const authenticate = useCallback(async (): Promise<boolean> => {
    const id = localStorage.getItem(CRED_KEY)
    if (!id || !window.PublicKeyCredential) return false
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32))
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ type: 'public-key', id: fromB64url(id) }],
          userVerification: 'required',
          timeout:          60_000,
        },
      })
      return !!assertion
    } catch { return false }
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(CRED_KEY)
    setCredentialId(null)
    setError(null)
  }, [])

  return {
    credentialId,
    registered: !!credentialId,
    registering,
    error,
    register,
    authenticate,
    reset,
  }
}
