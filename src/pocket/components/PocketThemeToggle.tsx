import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/ThemeContext'
import { cn } from '../../lib/utils'

export default function PocketThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch Pocket to light mode' : 'Switch Pocket to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      data-pocket-theme-toggle
      className={cn(
        'pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-950 active:scale-[0.96] dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1] dark:hover:text-white',
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
