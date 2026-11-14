import { NearConnector } from '@hot-labs/near-connect'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { NETWORK } from './near'
import type { Tx } from './dao'

interface WalletState {
  accountId: string | null
  ready: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  send: (tx: Tx) => Promise<string>
}

const WalletContext = createContext<WalletState | null>(null)

let connector: NearConnector | null = null
function getConnector(): NearConnector {
  if (!connector) {
    connector = new NearConnector({
      network: NETWORK,
      features: { signAndSendTransaction: true, testnet: true },
      footerBranding: null,
    })
  }
  return connector
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const c = getConnector()
    const onIn = (t: { accounts: { accountId: string }[] }) => setAccountId(t.accounts[0]?.accountId ?? null)
    const onOut = () => setAccountId(null)
    c.on('wallet:signIn', onIn)
    c.on('wallet:signOut', onOut)
    c.getConnectedWallet()
      .then(({ accounts }) => setAccountId(accounts[0]?.accountId ?? null))
      .catch(() => setAccountId(null))
      .finally(() => setReady(true))
    return () => {
      c.off('wallet:signIn', onIn)
      c.off('wallet:signOut', onOut)
    }
  }, [])

  const signIn = useCallback(async () => {
    const c = getConnector()
    await c.whenManifestLoaded
    await c.connect()
  }, [])

  const signOut = useCallback(async () => {
    await getConnector().disconnect()
    setAccountId(null)
  }, [])

  const send = useCallback(
    async (tx: Tx) => {
      const wallet = await getConnector().wallet()
      const outcome = await wallet.signAndSendTransaction({
        network: NETWORK,
        signerId: accountId ?? undefined,
        receiverId: tx.receiverId,
        actions: tx.actions,
      })
      const status = (outcome as { status?: unknown }).status
      if (status && typeof status === 'object' && 'Failure' in status) {
        throw new Error(describeFailure((status as { Failure: unknown }).Failure))
      }
      return outcome.transaction.hash as string
    },
    [accountId],
  )

  const value = useMemo(() => ({ accountId, ready, signIn, signOut, send }), [accountId, ready, signIn, signOut, send])
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

function describeFailure(f: unknown): string {
  const s = JSON.stringify(f)
  const m = s.match(/ExecutionError\\?":\\?"([^"\\]+)/)
  return m ? m[1] : 'The transaction failed on chain.'
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet(): WalletState {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet outside WalletProvider')
  return ctx
}
