// Dark is the default; light is opt-in and remembered per browser.
export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  try {
    return localStorage.getItem('terra:theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(t: Theme) {
  if (t === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try {
    localStorage.setItem('terra:theme', t)
  } catch {
    /* storage unavailable */
  }
}
