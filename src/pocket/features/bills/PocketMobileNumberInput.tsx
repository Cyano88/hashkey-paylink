import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ContactRound } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  detectNigerianMobileNetwork,
  mobileNetworkServiceId,
  normalizeNigerianMobileNumber,
  type NigerianMobileNetwork,
} from '../../lib/nigerianMobileNetwork'

type MobileNetworkOption = {
  value: string
  label: string
}

type MobileNumberChange = {
  phoneNumber: string
  networkId: string
}

type ContactRecord = {
  tel?: string[]
}

type ContactPickerNavigator = Navigator & {
  contacts?: {
    select: (properties: string[], options: { multiple: boolean }) => Promise<ContactRecord[]>
  }
}

const NETWORK_PRESENTATION: Record<NigerianMobileNetwork, { src: string; className: string }> = {
  mtn: { src: '/brand/mobile-networks/mtn.svg', className: 'bg-[#ffcc00] p-1.5' },
  airtel: { src: '/brand/mobile-networks/airtel.svg', className: 'bg-white p-1.5' },
  glo: { src: '/brand/mobile-networks/glo.svg', className: 'bg-white p-0.5' },
  etisalat: { src: '/brand/mobile-networks/9mobile.svg', className: 'bg-white p-1' },
}

function networkFromServiceId(serviceId: string): NigerianMobileNetwork {
  const network = serviceId.replace(/-data$/, '')
  return network === 'airtel' || network === 'glo' || network === 'etisalat' ? network : 'mtn'
}

function cleanPhoneInput(value: string) {
  return normalizeNigerianMobileNumber(value).slice(0, 13)
}

function NetworkMark({ network }: { network: NigerianMobileNetwork }) {
  const presentation = NETWORK_PRESENTATION[network]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm ring-1 ring-black/[0.04]',
        presentation.className,
      )}
    >
      <img src={presentation.src} alt="" className="h-full w-full object-contain" />
    </span>
  )
}

export default function PocketMobileNumberInput({
  category,
  phoneNumber,
  selectedNetworkId,
  options,
  disabled = false,
  loading = false,
  onChange,
}: {
  category: 'airtime' | 'data'
  phoneNumber: string
  selectedNetworkId: string
  options: MobileNetworkOption[]
  disabled?: boolean
  loading?: boolean
  onChange: (value: MobileNumberChange) => void
}) {
  const [contactPickerAvailable, setContactPickerAvailable] = useState(false)
  const [contactError, setContactError] = useState('')
  const manualNetworkOverride = useRef(false)
  const selectedNetwork = networkFromServiceId(selectedNetworkId)
  const selectedOption = options.find(option => option.value === selectedNetworkId)
  const normalizedPhone = normalizeNigerianMobileNumber(phoneNumber)
  const hasCompleteNumber = normalizedPhone.startsWith('234')
    ? normalizedPhone.length >= 13
    : normalizedPhone.length >= 11
  const invalidNumber = hasCompleteNumber && !/^0\d{10}$/.test(normalizedPhone)

  useEffect(() => {
    const picker = (navigator as ContactPickerNavigator).contacts
    setContactPickerAvailable(Boolean(window.isSecureContext && picker?.select))
  }, [])

  const updatePhone = (rawValue: string, resetManualOverride = false) => {
    const nextPhone = cleanPhoneInput(rawValue)
    if (!nextPhone || resetManualOverride) manualNetworkOverride.current = false

    const detected = detectNigerianMobileNetwork(nextPhone)
    const detectedId = detected ? mobileNetworkServiceId(detected, category) : ''
    const detectedOption = options.find(option => option.value === detectedId)
    const nextNetworkId = !manualNetworkOverride.current && detectedOption
      ? detectedOption.value
      : selectedNetworkId

    setContactError('')
    onChange({ phoneNumber: nextPhone, networkId: nextNetworkId })
  }

  const pickContact = async () => {
    const picker = (navigator as ContactPickerNavigator).contacts
    if (!picker?.select) return
    try {
      const contacts = await picker.select(['tel'], { multiple: false })
      const selectedPhone = contacts[0]?.tel?.[0]
      if (selectedPhone) updatePhone(selectedPhone, true)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setContactError('Contacts are unavailable. Enter the number instead.')
    }
  }

  return (
    <div>
      <div
        className={cn(
          'flex min-h-[58px] items-center overflow-hidden rounded-2xl border bg-white shadow-sm transition',
          'border-gray-200 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10',
          'dark:border-white/10 dark:bg-[#17181d] dark:focus-within:border-blue-400/50',
          invalidNumber && 'border-red-300 focus-within:border-red-400 focus-within:ring-red-500/10 dark:border-red-400/40',
        )}
      >
        <label className="relative flex h-[58px] min-w-[108px] shrink-0 cursor-pointer items-center gap-2 border-r border-gray-200 px-3 dark:border-white/10">
          <NetworkMark network={selectedNetwork} />
          <span className="min-w-0 flex-1 truncate text-xs font-black text-gray-900 dark:text-white">
            {selectedOption?.label ?? 'Network'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <select
            value={selectedNetworkId}
            disabled={disabled || loading || options.length === 0}
            onChange={event => {
              manualNetworkOverride.current = true
              setContactError('')
              onChange({ phoneNumber: normalizedPhone, networkId: event.target.value })
            }}
            aria-label={`Select ${category} network`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          >
            {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <label className="min-w-0 flex-1 px-3">
          <span className="sr-only">Phone number</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            disabled={disabled}
            value={phoneNumber}
            onChange={event => updatePhone(event.target.value)}
            onBlur={event => updatePhone(event.target.value)}
            placeholder="0801 234 5678"
            aria-invalid={invalidNumber}
            className="h-12 w-full min-w-0 bg-transparent text-[15px] font-semibold tabular-nums tracking-[0.01em] text-gray-950 outline-none placeholder:text-gray-300 disabled:opacity-60 dark:text-white dark:placeholder:text-gray-600"
          />
        </label>

        {contactPickerAvailable && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void pickContact()}
            aria-label="Choose a phone number from contacts"
            className="mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:opacity-50 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            <ContactRound className="h-[19px] w-[19px]" />
          </button>
        )}
      </div>

      {invalidNumber && <p className="mt-1.5 px-1 text-[10px] font-semibold text-red-500">Enter a valid 11-digit Nigerian number.</p>}
      {!invalidNumber && contactError && <p className="mt-1.5 px-1 text-[10px] font-semibold text-red-500">{contactError}</p>}
      {!invalidNumber && !contactError && detectedNetworkFromPhone(phoneNumber) && (
        <p className="mt-1.5 px-1 text-[10px] font-medium text-gray-400">Network detected. You can change it for a ported number.</p>
      )}
    </div>
  )
}

function detectedNetworkFromPhone(value: string) {
  return detectNigerianMobileNetwork(value)
}
