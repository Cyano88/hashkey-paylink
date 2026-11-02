import {useEffect, useState} from 'react'

export default function PocketBootFallback() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 15000)
    return () => window.clearTimeout(timer)
  }, [])
  return <main className="flex min-h-[100dvh] items-center justify-center bg-[#F5F5F7] px-6 text-center text-gray-950 dark:bg-[#0A0A0A] dark:text-white">
    <div><h1 className="text-lg font-semibold">Opening Pocket</h1>
      <p role="status" className="mt-3 text-sm text-gray-500">{slow ? 'This is taking longer than expected. Try opening Pocket again.' : 'Please wait a moment.'}</p>
      {slow && <button className="mt-6 rounded-full bg-gray-950 px-6 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950" onClick={() => window.location.reload()}>Try again</button>}
    </div>
  </main>
}
