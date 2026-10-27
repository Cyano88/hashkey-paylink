import { useRef, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Plus } from 'lucide-react'
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
  const locked = busy || pending
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (locked || submitting.current) return
    let message = ''
    if (form.name.trim().length < 2) message = 'Enter a project name with at least 2 characters.'
    else {
      try { const url = new URL(form.website.trim()); if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new Error() }
      catch { message = 'Enter your website starting with https://.' }
    }
    if (!message && form.useCase.trim().length < 20) message = 'Tell us a little more about your app (at least 20 characters).'
    if (!message && (!form.capabilities.length || !form.capabilities.every(isOpenCheckoutProduct))) message = 'Choose at least one payment option.'
    setValidation(message)
    if (message) return
    submitting.current = true
    setPending(true)
    try { await onCreate() }
    catch (reason) { setValidation(reason instanceof Error ? reason.message : 'Project could not be created. Try again.') }
    finally { submitting.current = false; setPending(false) }
  }
  return <form noValidate onSubmit={submit} aria-busy={locked} className={embedded ? '' : 'mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-8'}>
    {onCancel && <button type="button" disabled={locked} onClick={onCancel} className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gray-500 disabled:opacity-50"><ArrowLeft className="h-4 w-4"/>Back to projects</button>}
    <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-300">New project</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-tight">Create your project</h1>
    <p className="mt-2 text-sm leading-6 text-gray-500">Tell us about your app and choose how customers will use it.</p>
    {emptyAccount && <p className="mt-3 text-sm leading-6 text-gray-500">No projects are linked to this sign-in. If you expected an existing project, use the email that created it.</p>}
    <fieldset disabled={locked} className="mt-6 min-w-0 space-y-4" onChange={() => setValidation('')}>
      <label className="block space-y-1.5"><span className="text-sm font-semibold">Project name</span><input className={inputClass} value={form.name} maxLength={100} autoComplete="organization" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Your app"/></label>
      <label className="block space-y-1.5"><span className="text-sm font-semibold">Website</span><input type="url" inputMode="url" autoComplete="url" className={inputClass} value={form.website} onChange={event => setForm(current => ({ ...current, website: event.target.value }))} placeholder="https://yourapp.com"/></label>
      <label className="block space-y-1.5"><span className="text-sm font-semibold">What are you building?</span><textarea className={inputClass + ' h-24 resize-none py-3 leading-5'} value={form.useCase} maxLength={800} onChange={event => setForm(current => ({ ...current, useCase: event.target.value }))} placeholder="For example, customers pay for subscriptions to our app."/></label>
      <ProductPicker mode="human" value={form.capabilities} disabled={locked} onChange={capabilities => { setValidation(''); setForm(current => ({ ...current, capabilities })) }}/>
    </fieldset>
    {(validation || error) && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{validation || error}</p>}
    <div className={'mt-6 grid gap-2 ' + (onCancel ? 'sm:grid-cols-[auto_1fr]' : '')}>
      {onCancel && <button type="button" disabled={locked} onClick={onCancel} className="h-12 rounded-full border border-gray-200 px-5 text-sm font-semibold disabled:opacity-50 dark:border-white/10">Cancel</button>}
      <button type="submit" disabled={locked} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{locked ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}{locked ? 'Creating project' : 'Create project'}</button>
    </div>
  </form>
}
