import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapacitorApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { StatusBar, Style } from '@capacitor/status-bar'
import { registerPlugin } from '@capacitor/core'
import { isPocketNativeRuntime, POCKET_HOSTNAME } from '../lib/pocketRoutes'

function nativePocketDestination(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (url.hostname !== POCKET_HOSTNAME && url.protocol !== 'pocket:') return ''
    return `${url.pathname || '/'}${url.search}${url.hash}`
  } catch {
    return ''
  }
}

type PocketNativeInsets = { top: number; bottom: number; topPx?: number; bottomPx?: number; density?: number }
const PocketInsets = registerPlugin<{ getInsets(): Promise<PocketNativeInsets> }>('PocketInsets')

function nativeInsetCssPixels(value: number | undefined, pixels: number | undefined, density: number | undefined) {
  if (Number.isFinite(pixels) && Number.isFinite(density) && Number(density) > 0) {
    return Math.max(0, Math.round(Number(pixels) / Number(density)))
  }
  const measured = Math.max(0, Number(value) || 0)
  const ratio = Math.max(1, window.devicePixelRatio || 1)
  return measured > 48 && ratio > 1 ? Math.round(measured / ratio) : Math.round(measured)
}

export default function PocketNativeBridge() {
  const navigate = useNavigate()
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (!isPocketNativeRuntime()) return
    let active = true
    const listeners: Array<Promise<{ remove: () => Promise<void> }>> = []

    // Android 16 enforces edge-to-edge and ignores overlaysWebView. Read the
    // native inset and expose it to CSS instead of trusting env() alone.
    const syncInsets = () => void PocketInsets.getInsets().then(info => {
      if (!active) return
      document.documentElement.style.setProperty('--pocket-status-bar-inset', `${nativeInsetCssPixels(info.top, info.topPx, info.density)}px`)
      document.documentElement.style.setProperty('--pocket-navigation-bar-inset', `${nativeInsetCssPixels(info.bottom, info.bottomPx, info.density)}px`)
    }).catch(() => StatusBar.getInfo().then(info => {
      if (active) document.documentElement.style.setProperty('--pocket-status-bar-inset', `${Math.max(0, Math.round((info.height || 0) / Math.max(1, window.devicePixelRatio || 1)))}px`)
    }).catch(() => undefined))
    syncInsets()
    const syncStatusBar = () => {
      const style = document.documentElement.classList.contains('dark') ? Style.Dark : Style.Light
      void StatusBar.setStyle({ style }).catch(() => undefined)
    }
    syncStatusBar()
    const themeObserver = new MutationObserver(syncStatusBar)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    void Network.getStatus().then(status => {
      if (active) setOnline(status.connected)
    }).catch(() => undefined)

    listeners.push(Network.addListener('networkStatusChange', status => {
      if (active) setOnline(status.connected)
    }))
    listeners.push(CapacitorApp.addListener('appUrlOpen', event => {
      const destination = nativePocketDestination(event.url)
      if (destination) navigate(destination)
    }))
    listeners.push(CapacitorApp.addListener('appStateChange', state => {
      if (state.isActive) {
        syncInsets()
        window.dispatchEvent(new Event('focus'))
        document.dispatchEvent(new Event('visibilitychange'))
      }
    }))

    void CapacitorApp.getLaunchUrl().then(result => {
      const destination = result?.url ? nativePocketDestination(result.url) : ''
      if (destination) navigate(destination, { replace: true })
    }).catch(() => undefined)

    return () => {
      active = false
      document.documentElement.style.removeProperty('--pocket-status-bar-inset')
      document.documentElement.style.removeProperty('--pocket-navigation-bar-inset')
      themeObserver.disconnect()
      for (const listener of listeners) void listener.then(handle => handle.remove()).catch(() => undefined)
    }
  }, [navigate])

  if (!isPocketNativeRuntime() || online) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[100] bg-gray-950 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-center text-[11px] font-semibold text-white dark:bg-white dark:text-gray-950">
      Offline - balances and activity will update when you reconnect
    </div>
  )
}
