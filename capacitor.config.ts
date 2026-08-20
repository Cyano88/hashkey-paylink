import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hashpaylink.pocket',
  appName: 'Pocket',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: {
    hostname: 'app.hashpaylink.com',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#F5F5F7',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
