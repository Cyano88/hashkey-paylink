import PocketBottomSheet from '../../components/PocketBottomSheet'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from '../../components/PocketIcons'
import { IdentificationIcon as ContactRound } from '@heroicons/react/24/outline'
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
  const [networkOpen, setNetworkOpen] = useState(false)
  const [contactPickerAvailable, setContactPickerAvailable] = useState(false)
  const [contactError, setContactError] = useState('')
  const manualNetworkOverride = useRef(false)
  const selectedNetwork = networkFromServiceId(selectedNetworkId)
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
      {networkOpen && <PocketBottomSheet title="Select network" onClose={() => setNetworkOpen(false)}>
        <h2 className="mb-3 text-sm font-bold">Select network</h2>
        <div role="listbox" aria-label="Mobile networks">{options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === selectedNetworkId} onClick={() => { manualNetworkOverride.current = true; setContactError(''); onChange({ phoneNumber: normalizedPhone, networkId: option.value }); setNetworkOpen(false) }} className="flex min-h-14 w-full items-center gap-3 text-left text-sm font-semibold">
          <NetworkMark network={networkFromServiceId(option.value)} /><span className="flex-1">{option.label}</span><span aria-hidden="true" className={cn('h-4 w-4 rounded-full border', option.value === selectedNetworkId ? 'border-4 border-gray-950 dark:border-white' : 'border-gray-300 dark:border-gray-600')} />
        </button>)}</div>
      </PocketBottomSheet>}

      <div
        className={cn(
          'flex min-h-[52px] items-center overflow-hidden rounded-2xl border bg-white shadow-sm transition',
          'border-gray-200 focus-within:border-gray-400 focus-within:ring-4 focus-within:ring-blue-500/10',
          'dark:border-[#262626] dark:bg-[#17181d] dark:focus-within:border-gray-400/50',
          invalidNumber && 'border-red-300 focus-within:border-red-400 focus-within:ring-red-500/10 dark:border-red-400/40',
        )}
      >
        <button type="button" aria-label={`Select ${category} network`} aria-haspopup="dialog" disabled={disabled || loading || options.length === 0} onClick={() => setNetworkOpen(true)} className="relative flex h-[50px] w-[72px] shrink-0 items-center gap-2 border-r border-gray-200 px-2.5 disabled:opacity-50 dark:border-[#262626]">
          <NetworkMark network={selectedNetwork} />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>

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
            className="h-11 w-full min-w-0 bg-transparent text-[15px] font-semibold tabular-nums tracking-[0.01em] text-gray-950 outline-none placeholder:text-gray-300 disabled:opacity-60 dark:text-white dark:placeholder:text-gray-600"
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
