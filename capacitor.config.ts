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
    // Point at the canonical www host directly — the apex returns a 307
    // redirect and Capacitor treats the redirected host as a foreign
    // navigation target, which produces a black screen in the WebView.
    url: 'https://www.bikerornot.com',
    androidScheme: 'https',
    cleartext: false,
    // Allow navigation between apex and www, and to common off-site auth /
    // storage hosts the site links to. Anything outside this list gets
    // handed off to the system browser.
    allowNavigation: [
      'bikerornot.com',
      '*.bikerornot.com',
      '*.supabase.co',
      '*.supabase.in',
    ],
  },
  plugins: {
    SplashScreen: {
      // Remote mode means first-paint depends on network. Give the splash
      // long enough to hide the blank-WebView moment on typical LTE, and
      // let the plugin auto-hide once the WebView signals it's ready.
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#09090b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'FIT_CENTER',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
}

export default config
