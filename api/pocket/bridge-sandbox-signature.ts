import { createHash, createPublicKey, verify } from 'node:crypto'

export function verifyBridgeSandboxSignature(raw: Buffer, header: string, publicKey: string, now = Date.now()) {
  try {
    const match = /^t=(\d{13}),v0=([A-Za-z0-9+/]+={0,2})$/.exec(header)
    if (!match || raw.length > 262144 || Math.abs(now - Number(match[1])) > 600000) return false
    const signature = Buffer.from(match[2], 'base64')
    if (signature.toString('base64') !== match[2]) return false
    const key = createPublicKey(publicKey)
    if (key.asymmetricKeyType !== 'rsa') return false
    const digest = createHash('sha256').update(match[1] + '.').update(raw).digest()
    // Bridge signs a SHA256 digest, then RSA-SHA256 hashes that digest again.
    return verify('RSA-SHA256', digest, key, signature)
  } catch { return false }
}
