import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hashpaylink.pocket',
  appName: 'Pocket',
  webDir: 'dist',
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: '#F5F5F7',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
    },
  },
}

export default config
