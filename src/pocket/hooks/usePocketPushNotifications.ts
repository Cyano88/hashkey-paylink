import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { NavigateFunction } from 'react-router-dom'
import { refreshPocketData } from '../lib/pocketRefresh'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { POCKET_API } from '../lib/pocketSchemas'

// Push registration must stay off unless the native build includes a matching
// Firebase configuration. Calling register() without it crashes Android in the
// native plugin thread, which JavaScript error handling cannot recover from.
const POCKET_PUSH_ENABLED = import.meta.env.VITE_POCKET_PUSH_ENABLED === 'true'

const ALLOWED_PATHS = new Set<string>([
  POCKET_ROUTES.home,
  POCKET_ROUTES.activity,
  POCKET_ROUTES.notifications,
])

export default function usePocketPushNotifications(input: {
  authenticated: boolean
  ready: boolean
  getAccessToken(): Promise<string | null>
  navigate: NavigateFunction
}) {
  useEffect(() => {
    if (!POCKET_PUSH_ENABLED || !Capacitor.isNativePlatform() || !input.ready || !input.authenticated) return
    let disposed = false
    let registered: { token: string; accessToken: string } | null = null
    const handles: Array<{ remove(): Promise<void> }> = []
    const unregister = ({ token, accessToken }: { token: string; accessToken: string }) => fetch(POCKET_API.pushDevices, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => undefined)
    const register = async () => {
      handles.push(await PushNotifications.addListener('registration', async registration => {
        if (disposed) return
        const accessToken = await input.getAccessToken()
        if (!accessToken) return
        const response = await fetch(POCKET_API.pushDevices, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: registration.value, platform: Capacitor.getPlatform() }),
        }).catch(() => null)
        if (!response?.ok) return
        const device = { token: registration.value, accessToken }
        if (disposed) void unregister(device)
        else registered = device
      }))
      handles.push(await PushNotifications.addListener('registrationError', () => {
        // Permission can remain granted while FCM registration is temporarily
        // unavailable. The next authenticated app launch retries safely.
      }))
      handles.push(await PushNotifications.addListener('pushNotificationReceived', () => {
        void refreshPocketData()
      }))
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const path = String(action.notification.data?.path ?? '')
        if (ALLOWED_PATHS.has(path)) input.navigate(POCKET_BASE_PATH + path)
        void refreshPocketData()
      }))
      await PushNotifications.createChannel({
        id: 'pocket-payments',
        name: 'Pocket payments',
        description: 'Payment and request updates',
        importance: 4,
        visibility: 0,
      }).catch(() => undefined)
      let permission = await PushNotifications.checkPermissions()
      if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions()
      if (permission.receive === 'granted') await PushNotifications.register()
    }
    void register().catch(() => undefined)
    return () => {
      disposed = true
      if (registered) void unregister(registered)
      handles.forEach(handle => { void handle.remove() })
    }
  }, [input.authenticated, input.getAccessToken, input.navigate, input.ready])
}
