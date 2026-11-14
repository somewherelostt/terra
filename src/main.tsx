import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getTheme } from './lib/theme'
import { WalletProvider } from './lib/wallet.tsx'
import { Toaster } from './components/ui.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { initI18n } from './i18n'

applyTheme(getTheme())

// Load the visitor's language first so the first paint isn't English-then-something-else.
void initI18n().finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WalletProvider>
        <App />
        <Toaster />
      </WalletProvider>
    </ErrorBoundary>
  </StrictMode>,
))
