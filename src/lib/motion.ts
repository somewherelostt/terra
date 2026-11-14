import { useEffect, useRef, useState } from 'react'

export const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Tween a number from its previous value to `value` (ease-out cubic).
 * The first time a real value arrives it counts up from 0.
 */
export function useCountUp(value: number, duration = 800, firstDuration = 1000): number {
  const [shown, setShown] = useState(reduceMotion || !isFinite(value) ? value : 0)
  const from = useRef<number | null>(null)
  useEffect(() => {
    if (!isFinite(value)) {
      setShown(value)
      return
    }
    const start = from.current ?? 0
    const dur = from.current == null ? firstDuration : duration
    from.current = value
    if (reduceMotion || start === value) {
      setShown(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      setShown(start + (value - start) * ease(t))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, firstDuration])
  return shown
}

/** Remembers the last value and reports the change when it moves (for floating deltas). */
export function useDelta(value: number): { delta: number; key: number } | null {
  const prev = useRef<number | null>(null)
  const [d, setD] = useState<{ delta: number; key: number } | null>(null)
  useEffect(() => {
    if (!isFinite(value)) return
    if (prev.current != null && Math.abs(value - prev.current) > 0.004) setD({ delta: value - prev.current, key: Date.now() })
    prev.current = value
  }, [value])
  return d
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, reduceMotion ? 0 : ms))
