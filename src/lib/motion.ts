import { useEffect, useRef, useState } from 'react'

export const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Tween a number from its previous value to `value` (ease-out cubic).
 * The first time a real value arrives it counts up from 0.
 */
export function useCountUp(value: number, duration = 800, firstDuration = 1000): number {
  const [shown, setShown] = useState(reduceMotion || !isFinite(value) ? value : 0)
  // Start each tween from what is on screen, so a re-run (or React's dev double-run) never skips it.
  const current = useRef(0)
  const started = useRef(false)
  useEffect(() => {
    if (!isFinite(value)) {
      setShown(value)
      return
    }
    const start = current.current
    const dur = started.current ? duration : firstDuration
    if (reduceMotion || start === value) {
      current.current = value
      started.current = true
      setShown(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const v = start + (value - start) * ease(t)
      current.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(step)
      else started.current = true
    }
    raf = requestAnimationFrame(step)
    // Background tabs pause animation frames; never leave a wrong number on screen.
    const done = setTimeout(() => {
      cancelAnimationFrame(raf)
      current.current = value
      started.current = true
      setShown(value)
    }, dur + 150)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(done)
    }
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
