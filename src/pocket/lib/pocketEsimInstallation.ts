import { Capacitor, registerPlugin } from '@capacitor/core'

export type EsimInstallation = {
  iccid: string; activationCode: string; apn?: string; status?: string; smdpStatus?: string
}
const native = registerPlugin<{ install(options: { activationCode: string }): Promise<void>; settings(): Promise<void> }>('PocketEsim')

export function esimInstallUrl(code: string, platform: string): string | null {
  if (!/^LPA:1\$[^$\s]+\$[^$\s]+(?:\$[^\s]*)?$/.test(code) || code.length > 2048) return null
  const host = platform === 'android' ? 'esimsetup.android.com' : platform === 'ios' ? 'esimsetup.apple.com' : ''
  return host ? `https://${host}/esim_qrcode_provisioning?carddata=${encodeURIComponent(code)}` : null
}
export function esimDevicePlatform() {
  const platform = Capacitor.getPlatform()
  if (platform !== 'web') return platform
  if (/Android/i.test(navigator.userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  return 'web'
}
export function esimAlreadyInstalled(profile: EsimInstallation) {
  return ['IN_USE', 'USED_UP', 'EXPIRED'].includes(profile.status || '') || ['INSTALLATION', 'ENABLED', 'DISABLED'].includes(profile.smdpStatus || '')
}
export async function installEsim(code: string) {
  const url = esimInstallUrl(code, esimDevicePlatform())
  if (!url) throw Error('Use the QR code or manual installation on your phone.')
  if (Capacitor.getPlatform() === 'android') await native.install({ activationCode: code })
  else window.location.assign(url)
}
export const canOpenEsimSettings = () => Capacitor.getPlatform() === 'android'
export const openEsimSettings = () => native.settings()
