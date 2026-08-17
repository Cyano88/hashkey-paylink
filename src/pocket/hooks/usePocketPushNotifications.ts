import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { NavigateFunction } from 'react-router-dom'
import { refreshPocketData } from '../lib/pocketRefresh'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { POCKET_API } from '../lib/pocketSchemas'
import { pocketPushEnabled, POCKET_PUSH_PREFERENCE_EVENT, rememberPocketPushToken, unregisterPocketPushDevice } from '../lib/pocketPushPreference'

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
  const [userEnabled, setUserEnabled] = useState(pocketPushEnabled)
  useEffect(() => {
    const update = () => setUserEnabled(pocketPushEnabled())
    window.addEventListener(POCKET_PUSH_PREFERENCE_EVENT, update)
    return () => window.removeEventListener(POCKET_PUSH_PREFERENCE_EVENT, update)
  }, [])
  useEffect(() => {
    if (userEnabled || !input.authenticated) return
    void unregisterPocketPushDevice(input.getAccessToken).catch(() => undefined)
  }, [input.authenticated, input.getAccessToken, userEnabled])
  useEffect(() => {
    if (!POCKET_PUSH_ENABLED || !userEnabled || !Capacitor.isNativePlatform() || !input.ready || !input.authenticated) return
    const handles: Array<{ remove(): Promise<void> }> = []
    const register = async () => {
      handles.push(await PushNotifications.addListener('registration', async registration => {
        const accessToken = await input.getAccessToken()
        if (!accessToken) return
        const response = await fetch(POCKET_API.pushDevices, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: registration.value, platform: Capacitor.getPlatform() }),
        }).catch(() => null)
        if (!response?.ok) return
        rememberPocketPushToken(registration.value)
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
        name: 'Pocket notifications',
        description: 'Payments, service status, and Pocket updates',
        importance: 4,
        visibility: 0,
      }).catch(() => undefined)
      let permission = await PushNotifications.checkPermissions()
      if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions()
      if (permission.receive === 'granted') await PushNotifications.register()
    }
    void register().catch(() => undefined)
    return () => {
      handles.forEach(handle => { void handle.remove() })
    }
  }, [input.authenticated, input.getAccessToken, input.navigate, input.ready, userEnabled])
}
