import { Capacitor } from '@capacitor/core'
import { AccessControl, NativeBiometric } from '@capgo/capacitor-native-biometric'

const ENABLED_KEY = 'pocket:payment-biometrics:enabled:v1'
const PIN_PREFIX = 'pocket-pin-v1:'

function server(email: string) { return `com.hashpaylink.pocket.payment.${email.trim().toLowerCase()}` }
export function pocketPaymentBiometricsEnabled() { return Capacitor.isNativePlatform() && localStorage.getItem(ENABLED_KEY) === 'true' }
export function pocketPaymentBiometricsConfigured() { return Capacitor.isNativePlatform() && localStorage.getItem(ENABLED_KEY) !== null }
export async function pocketPaymentBiometricsAvailable() {
  if (!Capacitor.isNativePlatform()) return false
  const value = await NativeBiometric.isAvailable({ useFallback: false }).catch(() => null)
  return Boolean(value?.isAvailable && value.strongBiometryIsAvailable)
}
export async function enablePocketPaymentBiometrics(email: string, pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new Error('Enter your six-digit Pocket PIN first.')
  if (!await pocketPaymentBiometricsAvailable()) throw new Error('Fingerprint or face approval is not available on this phone.')
  await NativeBiometric.setCredentials({
    server: server(email), username: email.trim().toLowerCase(), password: PIN_PREFIX + pin,
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
    title: 'Turn on payment approval', subtitle: 'Hash PayLink Pocket', negativeButtonText: 'Not now',
  })
  localStorage.setItem(ENABLED_KEY, 'true')
}
export async function disablePocketPaymentBiometrics(email: string) {
  localStorage.setItem(ENABLED_KEY, 'false')
  await NativeBiometric.deleteCredentials({ server: server(email) }).catch(() => undefined)
}
export async function readPocketPinWithBiometrics(email: string) {
  if (!pocketPaymentBiometricsEnabled()) return null
  const credentials = await NativeBiometric.getSecureCredentials({
    server: server(email), title: 'Approve payment', subtitle: 'Hash PayLink Pocket',
    description: 'Confirm this payment with fingerprint or face.', negativeButtonText: 'Use Pocket PIN',
  })
  if (credentials.username !== email.trim().toLowerCase() || !credentials.password.startsWith(PIN_PREFIX)) throw new Error('Payment approval needs to be set up again.')
  const pin = credentials.password.slice(PIN_PREFIX.length)
  if (!/^\d{6}$/.test(pin)) throw new Error('Payment approval needs to be set up again.')
  return pin
}
