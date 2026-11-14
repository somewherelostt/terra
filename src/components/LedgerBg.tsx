import { Fragment } from 'react'

/**
 * Landing hero, dark mode only: faint columns of a group ledger scrolling slowly up both sides.
 * Decorative (aria-hidden, no text for screen readers or i18n). Demo first names only, never real people.
 * Styles live in index.css (.fin-ledger); light mode hides it and reduced motion holds it still.
 */
const LEDGER_ROWS: [string, string, string, '' | 'ok' | 'out'][] = [
  ['09:12', 'chip in · priya', '+15.02', 'ok'], ['09:14', 'poster · designer', '−20.00', 'out'], ['09:14', 'swap · NEAR→USDC', '6.10', ''],
  ['09:15', 'approved 1/1', 'small', 'ok'], ['09:31', 'chip in · ravi', '+25.00', 'ok'], ['09:40', 'venue deposit', '−300.00', 'out'],
  ['09:41', 'approved 2/2', 'mid', 'ok'], ['09:58', 'chip in · ana', '+10.00', 'ok'], ['10:02', 'snacks · meetup', '−42.50', 'out'],
  ['10:03', 'quote · USDC/Base', '42.53', ''], ['10:20', 'chip in · leo', '+5.00', 'ok'], ['10:27', 'staked · pool', '200.0', ''],
  ['10:44', 'photographer', '−120.00', 'out'], ['10:45', 'approved 3/4', 'large', 'ok'], ['11:02', 'chip in · sam', '+20.00', 'ok'],
]
const MARKS = { ok: '✓', out: '↗', '': '·' }

function Mark({ kind }: { kind: '' | 'ok' | 'out' }) {
  return <span className={kind}>{MARKS[kind]}</span>
}

function LedgerTape({ seed, narrow }: { seed: number; narrow?: boolean }) {
  const rows: React.ReactNode[] = []
  for (let i = 0; i < 26; i++) {
    const r = LEDGER_ROWS[(i * 4 + seed) % LEDGER_ROWS.length]
    if (i % 7 === 3) rows.push(<div key={`rc${i}`} className="rc">{`#${String(400 + seed * 31 + i).padStart(4, '0')}`}</div>)
    rows.push(
      narrow ? (
        <div key={i} className="ln"><span className="amt">{r[2]}</span><Mark kind={r[3]} /></div>
      ) : (
        <div key={i} className="ln"><span>{r[0]}</span><span>{r[1]}</span><span className="amt">{r[2]}</span><Mark kind={r[3]} /></div>
      ),
    )
  }
  // Doubled so the -50% scroll loops seamlessly.
  return <>{[0, 1].map((k) => <Fragment key={k}>{rows}</Fragment>)}</>
}

export default function LedgerBg() {
  const col = (cls: string, seed: number, t: number) => (
    <div className={`col ${cls}`}>
      <div className="tape" style={{ ['--t' as string]: `${t}s` } as React.CSSProperties}>
        <LedgerTape seed={seed} narrow={cls.includes('b')} />
      </div>
    </div>
  )
  return (
    <div className="fin-ledger" aria-hidden="true">
      {col('l', 1, 80)}
      {col('l b', 6, 110)}
      {col('r b', 11, 120)}
      {col('r', 16, 90)}
    </div>
  )
}
