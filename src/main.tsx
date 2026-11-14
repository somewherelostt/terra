import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getTheme } from './lib/theme'
import { WalletProvider } from './lib/wallet.tsx'
import { Toaster } from './components/ui.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <WalletProvider>
        <App />
        <Toaster />
      </WalletProvider>
    </ErrorBoundary>
  </StrictMode>,
)
