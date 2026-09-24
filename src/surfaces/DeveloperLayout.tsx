import { Outlet } from 'react-router-dom'
import '../developer/developer.css'

export default function DeveloperLayout() {
  return <div className="developer-surface min-h-screen bg-[#f5f5f7] font-sans text-gray-950 dark:bg-[#0a0a0a] dark:text-white">
    <a href="#developer-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-3 focus:text-gray-950">Skip to content</a>
    <Outlet />
  </div>
}
