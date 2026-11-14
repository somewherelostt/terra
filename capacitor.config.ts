import type { CapacitorConfig } from '@capacitor/cli'

// Android wrapper for the Terra web app. `pnpm build && npx cap sync android` copies dist/ into the APK.
const config: CapacitorConfig = {
  appId: 'app.useterra.terra',
  appName: 'Terra',
  webDir: 'dist',
  backgroundColor: '#0b0b0c',
  // The app's origin is the public site, so invite and share links built from window.location work outside the app.
  server: { hostname: 'www.useterra.app', androidScheme: 'https' },
  android: {
    // Testnet RPCs, wallets and quotes are all https; nothing needs cleartext.
    allowMixedContent: false,
  },
  plugins: {
    // Pad the WebView inside the status and navigation bars; light icons on the dark default theme.
    SystemBars: { insetsHandling: 'css', style: 'DARK' },
  },
}

export default config
