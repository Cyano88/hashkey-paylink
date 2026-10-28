import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme:  Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children, forcedTheme }: { children: React.ReactNode; forcedTheme?: Theme }) {
  const [preferredTheme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('hp_theme') as Theme | null
      if (saved === 'light' || saved === 'dark') return saved
    } catch { /* localStorage unavailable */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const theme = forcedTheme ?? preferredTheme

  useEffect(() => {
    const dark = theme === 'dark'
    const root = document.documentElement
    const pocketLightSurface = root.dataset.pocketLightSurface === 'true'
    root.classList.toggle('dark', dark && !pocketLightSurface)
    root.style.colorScheme = pocketLightSurface || forcedTheme === 'light' ? 'only light' : theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark && !pocketLightSurface ? '#0A0A0A' : '#F5F5F7')
    if (!forcedTheme) {
      try { localStorage.setItem('hp_theme', theme) } catch { /* Keep the selected theme usable when storage is blocked. */ }
    }
  }, [theme, forcedTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => { if (!forcedTheme) setTheme(t => t === 'light' ? 'dark' : 'light') } }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
