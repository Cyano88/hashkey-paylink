import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { CPurseIcon } from './CPurseIcon'
import type { PocketSplashState } from '../hooks/usePocketSessionSplash'
import usePocketLightSurface from '../hooks/usePocketLightSurface'

export default function PocketSessionSplash({
  state,
}: {
  state: PocketSplashState
}) {
  const nativeRuntime = Capacitor.isNativePlatform()
  const markVisible = nativeRuntime || state !== 'entering'
  const assembled = state === 'assembling' || state === 'holding' || state === 'launching'
  const launching = state === 'launching'
  usePocketLightSurface(state !== 'idle')

  useEffect(() => {
    if (!nativeRuntime) return
    let handoffFrame = 0
    const paintedFrame = window.requestAnimationFrame(() => {
      handoffFrame = window.requestAnimationFrame(() => {
        const launchBridge = (window as Window & { PocketLaunch?: { ready(): void } }).PocketLaunch
        launchBridge?.ready()
        void SplashScreen.hide().catch(() => undefined)
      })
    })
    return () => {
      window.cancelAnimationFrame(paintedFrame)
      if (handoffFrame) window.cancelAnimationFrame(handoffFrame)
    }
  }, [nativeRuntime])

  useEffect(() => {
    if (!nativeRuntime) return
    const lightSurface = document.documentElement.dataset.pocketLightSurface === 'true'
    const style = state === 'idle' && !lightSurface && document.documentElement.classList.contains('dark')
      ? Style.Dark
      : Style.Light
    void StatusBar.setStyle({ style }).catch(() => undefined)
  }, [nativeRuntime, state])

  if (state === 'idle') return null

  return (
    <div
      className={`fixed inset-0 z-[120] bg-[#F5F5F7] text-gray-950 transition-opacity duration-300 ease-out ${launching ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      aria-busy="true"
      aria-label="Opening Pocket"
    >
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center">
        <CPurseIcon
          size={96}
          title=""
          className={`shrink-0 text-gray-950 transition-[width,height,opacity,transform] duration-[980ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${assembled ? 'h-12 w-12' : 'h-24 w-24'} ${markVisible ? 'scale-100 opacity-100' : 'scale-[0.9] opacity-0'}`}
        />
        <div className={`overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity,transform] duration-[980ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${assembled ? 'ml-3 max-w-[12rem] translate-x-0 opacity-100' : 'ml-0 max-w-0 translate-x-4 opacity-0'}`}>
          <p className="text-[1.45rem] font-bold leading-none tracking-[-0.045em]">Pocket</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-gray-400">By Hash PayLink</p>
        </div>
      </div>
    </div>
  )
}
