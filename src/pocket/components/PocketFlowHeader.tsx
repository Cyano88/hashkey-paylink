import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from './PocketIcons'

export default function PocketFlowHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const navigate = useNavigate()
  return <header className="flex min-h-11 items-center gap-3">
    <button type="button" onClick={onBack ?? (() => navigate(-1))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-950 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-white" aria-label="Back"><ArrowLeft className="h-4 w-4" /></button>
    <h1 className="text-base font-black tracking-[-0.025em] text-gray-950 dark:text-white">{title}</h1>
  </header>
}
