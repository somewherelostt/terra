import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Last line of defence: if anything throws while rendering, show what happened and a way out
 * instead of a blank page. Styles are inline so it works even if the CSS failed to load.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Terra crashed while rendering:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const box: React.CSSProperties = {
      maxWidth: 560,
      margin: '12vh auto',
      padding: '0 24px',
      fontFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
      color: 'var(--ink, #f5f5f4)',
    }
    const btn: React.CSSProperties = {
      marginTop: 20,
      marginRight: 8,
      padding: '10px 16px',
      borderRadius: 8,
      border: '1px solid var(--line, #232326)',
      background: 'var(--accent, #c8f560)',
      color: '#0b0b0c',
      font: 'inherit',
      fontWeight: 500,
      cursor: 'pointer',
    }
    return (
      <div style={box} role="alert">
        <div style={{ fontSize: 13, opacity: 0.6 }}>terra</div>
        <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-0.02em', margin: '12px 0 8px' }}>Something went wrong on this page</h1>
        <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.5 }}>
          Your community's money is safe: it stays in the group's own DAO on NEAR. Reload the page, or go back to the start.
        </p>
        <button style={btn} onClick={() => window.location.reload()}>
          Reload
        </button>
        <button
          style={{ ...btn, background: 'transparent', color: 'inherit' }}
          onClick={() => {
            window.location.href = window.location.pathname
          }}
        >
          Back to start
        </button>
        <pre style={{ marginTop: 28, fontSize: 12, opacity: 0.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(error.message || error)}</pre>
      </div>
    )
  }
}
