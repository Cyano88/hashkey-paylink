import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from './PocketIcons'

export default function PocketFlowHeader({ title, onBack, centered = false }: { title: string; onBack?: () => void; centered?: boolean }) {
  const navigate = useNavigate()
  return <header className={centered ? "grid min-h-11 grid-cols-[40px_1fr_40px] items-center gap-3" : "flex min-h-11 items-center gap-3"}>
    <button type="button" onClick={onBack ?? (() => navigate(-1))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-950 shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none dark:text-white" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
    <h1 className={`text-base font-black tracking-[-0.025em] text-gray-950 dark:text-white ${centered ? "text-center" : ""}`}>{title}</h1>{centered && <span aria-hidden="true" className="w-10" />}
  </header>
}
