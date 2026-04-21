import type { CapacitorConfig } from '@capacitor/cli'

// Remote mode: the Android WebView loads https://bikerornot.com directly
// rather than a bundled static build. Required because the site uses Next.js
// server components and server actions (not compatible with static export).
//
// `appId` becomes the Android package name and is permanent once published to
// the Play Store — change here before the first upload, not after.
const config: CapacitorConfig = {
  appId: 'com.bikerornot.app',
  appName: 'BikerOrNot',
  webDir: 'public',
  server: {
    url: 'https://bikerornot.com',
    androidScheme: 'https',
    cleartext: false,
  },
}

export default config
