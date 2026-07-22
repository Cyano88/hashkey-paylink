import { useCallback, useMemo, useRef, useState } from 'react'
import { copyToClipboard, formatAmount } from '../../lib/utils'
import { buildPocketPayLink } from '../lib/pocketPayLinkBuilder'
import { hashPayLinkAppOriginForOrigin } from '../lib/pocketRoutes'
import type { PocketNetwork } from '../lib/pocketSchemas'
import { normalizePocketAmountInput, resolvePocketUsdcDraft } from './pocketUsdcDraftValidation'

export default function usePocketUsdcDraftController(network: PocketNetwork) {
  const [evmAddress, setEvmAddressState] = useState('')
  const [solanaAddress, setSolanaAddressState] = useState('')
  const [amount, setAmountState] = useState('')
  const [memo, setMemoState] = useState('')
  const [multiChain, setMultiChainState] = useState(false)
  const [flexibleAmount, setFlexibleAmountState] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)
  const qrHiResRef = useRef<HTMLDivElement>(null)

  const validation = useMemo(() => resolvePocketUsdcDraft({
    network,
    multiChain,
    flexibleAmount,
    amount,
    evmAddress,
    solanaAddress,
  }), [amount, evmAddress, flexibleAmount, multiChain, network, solanaAddress])

  const invalidateResult = useCallback(() => {
    setGeneratedLink('')
    setCopied(false)
  }, [])

  const setEvmAddress = useCallback((value: string) => {
    setEvmAddressState(value.trim())
    invalidateResult()
  }, [invalidateResult])

  const setSolanaAddress = useCallback((value: string) => {
    setSolanaAddressState(value.trim())
    invalidateResult()
  }, [invalidateResult])

  const setAmount = useCallback((value: string) => {
    setAmountState(normalizePocketAmountInput(value))
    invalidateResult()
  }, [invalidateResult])

  const setMemo = useCallback((value: string) => {
    setMemoState(value)
    invalidateResult()
  }, [invalidateResult])

  const setFlexibleAmount = useCallback((enabled: boolean) => {
    setFlexibleAmountState(enabled)
    if (enabled) setAmountState('')
    invalidateResult()
  }, [invalidateResult])

  const setMultiChain = useCallback((enabled: boolean) => {
    setMultiChainState(enabled)
    invalidateResult()
  }, [invalidateResult])

  const clearAddresses = useCallback(() => {
    setEvmAddressState('')
    setSolanaAddressState('')
    invalidateResult()
  }, [invalidateResult])

  const generate = useCallback(() => {
    if (!validation.canGenerate) return
    setGeneratedLink(buildPocketPayLink({
      origin: window.location.origin,
      network,
      multiChain,
      flexibleAmount,
      amount,
      evmAddress: validation.evmValid ? evmAddress : '',
      solanaAddress: validation.solanaValid ? solanaAddress : '',
      memo,
    }))
  }, [amount, evmAddress, flexibleAmount, memo, multiChain, network, solanaAddress, validation.canGenerate, validation.evmValid, validation.solanaValid])

  const reset = useCallback(() => {
    setEvmAddressState('')
    setSolanaAddressState('')
    setAmountState('')
    setMemoState('')
    setMultiChainState(false)
    setFlexibleAmountState(false)
    setGeneratedLink('')
    setCopied(false)
    setShareOpen(false)
  }, [])

  const copy = useCallback(async () => {
    if (!generatedLink) return
    await copyToClipboard(generatedLink)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }, [generatedLink])

  const shareText = useMemo(() => {
    const cleanedMemo = memo.trim()
    return cleanedMemo
      ? `Pay ${formatAmount(amount, 6)} USDC for ${cleanedMemo}`
      : `Pay ${formatAmount(amount, 6)} USDC with Hash PayLink`
  }, [amount, memo])

  const share = useCallback(async () => {
    if (!generatedLink) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Hash PayLink', text: shareText, url: generatedLink })
        return
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
      }
    }
    setShareOpen(true)
  }, [generatedLink, shareText])

  const dashboardUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (multiChain) {
      params.set('x', '1')
      if (validation.evmValid) params.set('e', evmAddress)
      if (validation.solanaValid) params.set('s', solanaAddress)
    } else {
      params.set('n', network)
      params.set(network === 'solana' ? 's' : 'e', network === 'solana' ? solanaAddress : evmAddress)
    }
    return `${hashPayLinkAppOriginForOrigin(window.location.origin)}/dashboard?${params.toString()}`
  }, [evmAddress, multiChain, network, solanaAddress, validation.evmValid, validation.solanaValid])

  const downloadQr = useCallback(() => {
    const canvas = qrHiResRef.current?.querySelector('canvas')
    if (!canvas) return
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')
    if (!context) return
    context.drawImage(canvas, 0, 0)
    const logo = new Image()
    logo.onload = () => {
      const size = Math.round(canvas.width * 0.15)
      const x = Math.round((canvas.width - size) / 2)
      const y = Math.round((canvas.height - size) / 2)
      const padding = 10
      context.fillStyle = '#ffffff'
      context.fillRect(x - padding, y - padding, size + padding * 2, size + padding * 2)
      context.drawImage(logo, x, y, size, size)
      const anchor = document.createElement('a')
      anchor.href = output.toDataURL('image/png')
      anchor.download = `${(memo.trim() || 'payment-link').replace(/\s+/g, '-')}-qr.png`
      anchor.click()
    }
    logo.src = '/hash-logo.png'
  }, [memo])

  return {
    evmAddress,
    solanaAddress,
    amount,
    memo,
    multiChain,
    flexibleAmount,
    generatedLink,
    copied,
    shareOpen,
    shareText,
    dashboardUrl,
    qrRef,
    qrHiResRef,
    validation,
    setEvmAddress,
    setSolanaAddress,
    setAmount,
    setMemo,
    setFlexibleAmount,
    setMultiChain,
    clearAddresses,
    invalidateResult,
    generate,
    reset,
    copy,
    share,
    closeShare: () => setShareOpen(false),
    downloadQr,
  }
}
