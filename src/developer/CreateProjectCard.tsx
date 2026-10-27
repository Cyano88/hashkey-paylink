import { useRef, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Plus } from 'lucide-react'
import ProductPicker from './ProductPicker'
import { isOpenCheckoutProduct, type ProductCapability } from '../lib/developerProducts'

export type CreateProjectForm = { name: string; website: string; useCase: string; checkoutMode: 'human'; capabilities: ProductCapability[] }
const inputClass = 'h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/5 dark:text-white'

export default function CreateProjectCard({ form, setForm, busy, error, onCreate, onCancel, embedded = false, emptyAccount = false }: {
  form: CreateProjectForm; setForm: Dispatch<SetStateAction<CreateProjectForm>>; busy: boolean; error: string;
  onCreate: () => Promise<void>; onCancel?: () => void; embedded?: boolean; emptyAccount?: boolean;
}) {
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [validation, setValidation] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const locked = busy || pending
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked || submitting.current) return
    let message = ''
    if (form.name.trim().length < 2) message = 'Enter a project name with at least 2 characters.'
    if (!message && (!form.capabilities.length || !form.capabilities.every(isOpenCheckoutProduct))) message = 'Choose at least one payment option.'
    setValidation(message)
    if (message) return
    if (step === 1) { setStep(2); return }
    submitting.current = true
    setPending(true)
    try { await onCreate() }
    catch (reason) { setValidation(reason instanceof Error ? reason.message : 'Project could not be created. Try again.') }
    finally { submitting.current = false; setPending(false) }
  }
  return <form noValidate onSubmit={submit} aria-busy={locked} className={embedded ? 'mx-auto max-w-lg py-8 sm:py-12' : 'mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-8'}>
    {(onCancel || step === 2) && <button type="button" disabled={locked} onClick={() => { if (step === 2) { setStep(1); setValidation('') } else onCancel?.() }} className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-500 disabled:opacity-50"><ArrowLeft className="h-4 w-4"/>{step === 2 ? 'Back' : 'Back to projects'}</button>}
    <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300">Step {step} of 2</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight">{step === 1 ? 'Name your project' : 'How will you use Hash PayLink?'}</h1>
    <p className="mt-2 text-sm leading-6 text-gray-500">{step === 1 ? 'Use the name of your app or business.' : 'Choose one or both. You can change this later.'}</p>
    {emptyAccount && <p className="mt-3 text-sm leading-6 text-gray-500">No projects are linked to this sign-in. If you expected an existing project, use the email that created it.</p>}
    <fieldset disabled={locked} className="mt-6 min-w-0 space-y-4" onChange={() => setValidation('')}>
      {step === 1 && <label className="block space-y-1.5"><span className="text-sm font-semibold">Project name</span><input className={inputClass} value={form.name} maxLength={100} autoComplete="organization" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Your app"/></label>}
      {step === 2 && <ProductPicker compact mode="human" value={form.capabilities} disabled={locked} onChange={capabilities => { setValidation(''); setForm(current => ({ ...current, capabilities })) }}/>}
    </fieldset>
    {(validation || error) && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{validation || error}</p>}
    <div className={'mt-6 grid gap-2 ' + (onCancel ? 'sm:grid-cols-[auto_1fr]' : '')}>
      {onCancel && <button type="button" disabled={locked} onClick={onCancel} className="h-12 rounded-full border border-gray-200 px-5 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Cancel</button>}
      <button type="submit" disabled={locked} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{locked ? <Loader2 className="h-4 w-4 animate-spin"/> : step===1 ? <ArrowRight className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}{locked ? 'Creating project' : step === 1 ? 'Continue' : 'Create project'}</button>
    </div>
  </form>
}
