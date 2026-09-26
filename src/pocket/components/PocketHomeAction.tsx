import type { ReactNode } from 'react'
export default function PocketHomeAction({label,icon,onClick}:{label:string;icon:ReactNode;onClick:()=>void}) {
  return <button type="button" onClick={onClick} className="group flex min-h-20 flex-col items-center justify-center gap-2 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm transition-colors group-active:bg-gray-100 dark:border-[#262626] dark:bg-[#121212] dark:shadow-none dark:group-active:bg-[#202020]">{icon}</span>
    <span>{label}</span>
  </button>
}
