import PocketPreviousWallets from './PocketPreviousWallets'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { prepareCircleEvmReplacement, reviewCircleEvmReplacement } from '../../lib/circleEvmEmailWallet'
import { unlockPocketBaseWallet } from '../controllers/usePocketWalletController'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import PocketMigrationExecution from './PocketMigrationExecution'
import type { PocketMigrationReview } from '../lib/pocketMigrationReview'

export default function PocketWalletPreparation({ email, getAccessToken }: {
  email: string; getAccessToken(): Promise<string | null>
}) {
  const navigate = useNavigate()
  const [previous,setPrevious]=useState(false)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'prepare'|'verified'|'review'|'completed'>('prepare')
  const [review, setReview] = useState<PocketMigrationReview | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const active = useRef(false)
  const locked = useRef(false)
  const completed = useRef(false)
  const operation = useRef<{session: Awaited<ReturnType<typeof unlockPocketBaseWallet>>['session']; attemptId: string} | null>(null)
  const goHome = () => {
    const home=POCKET_BASE_PATH + POCKET_ROUTES.home
    if(completed.current)window.location.replace(home)
    else navigate(home,{replace:true})
  }
  useEffect(() => {
    active.current=true
    void (async()=>{
      const token=await getAccessToken()
      if(!active.current||!token)return
      const response=await fetch(pocketApiUrl('/api/pocket/wallet-update/status'),{headers:{authorization:`Bearer ${token}`},cache:'no-store'})
      if(!response.ok)return
      const result=await response.json()
      if(active.current && result.ok===true && result.phase==='completed'){completed.current=true;setStage('completed')}
    })().catch(()=>undefined)
    return ()=>{active.current=false;operation.current=null}
  },[getAccessToken])
  const run = async () => {
    if(locked.current || completed.current || stage==='completed')return
    locked.current=true;setBusy(true);setError('');setNotice('')
    try {
      const token=await getAccessToken()
      if(!active.current || completed.current)return
      if(!token)throw Error('Sign in again before updating your wallet.')
      if(stage==='prepare') {
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email.trim().toLowerCase()))
        const owner=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
        const key='pocket:evm-preparation:v2:'+owner
        const attemptId=localStorage.getItem(key)||crypto.randomUUID()
        localStorage.setItem(key,attemptId)
        const {session}=await unlockPocketBaseWallet({authenticated:true,email,getAccessToken})
        if(!active.current || completed.current)return
        const result=await prepareCircleEvmReplacement(session,attemptId,token,()=>active.current && !completed.current)
        if(!active.current || completed.current)return
        if(result.status==='matching'){operation.current={session,attemptId};setStage('verified')}
        else if(result.status==='split')setError('Circle returned different addresses. Your current wallets are unchanged.')
        else setNotice('Wallet setup is not ready. Check again to resume the same attempt.')
      } else {
        const current=operation.current
        if(!current)throw Error('Recheck your wallets before reviewing the balance.')
        const result=await reviewCircleEvmReplacement(current.session,current.attemptId,token)
        if(!active.current || completed.current)return
        setReview(result);setStage('review')
      }
    }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:'Wallet update could not complete.')}
    finally{locked.current=false;if(active.current)setBusy(false)}
  }
  const executionReady=stage==='review' && !!review && review.rows.every(row=>row.status==='ok') && !!operation.current
  const cta='mt-5 min-h-12 w-full rounded-full bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'
  if(previous)return <section className='pt-6'><PocketPreviousWallets key={email} email={email} getAccessToken={getAccessToken} onBack={goHome}/></section>
  return <section className='w-full space-y-4 pt-6'>
    <article className='w-full rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
      <h2 className='text-lg font-black'>{stage==='completed'?'Migration complete':stage==='review'?'Review your balance':stage==='verified'?'Wallets verified':'Update your Pocket wallet'}</h2>
      {stage==='completed' ? <><p className='mt-3 text-sm leading-6 text-gray-500'>Your balance migration and updated wallets are confirmed.</p><button type='button' onClick={goHome} className={cta}>Proceed to Pocket</button><button type='button' onClick={()=>setPrevious(true)} className='mt-3 min-h-12 w-full text-sm font-bold'>Previous wallets</button></> : <>
        <p className='mt-3 text-sm leading-6 text-gray-500'>{stage==='verified'?'Your Base, Arbitrum and Arc replacement addresses match. Review your balance next.':'Your current wallets remain active until transfers and activation are confirmed.'}</p>
        {executionReady && operation.current ? <PocketMigrationExecution key={email} session={operation.current.session} getAccessToken={getAccessToken} onComplete={()=>{completed.current=true;setStage('completed')}} /> : stage==='review' && review && <>
          <dl className='mt-5 space-y-3'>{review.rows.map(row=><div key={row.network} className='flex justify-between gap-3 text-sm'><dt className='capitalize'>{row.network}</dt><dd>{row.status==='ok' && row.balance!==null?`${row.balance.toLocaleString(undefined,{maximumFractionDigits:6})} USDC`:'Unavailable'}</dd></div>)}</dl>
          <p role='status' className='mt-5 text-sm leading-6 text-gray-500'>Some balances are unavailable. Refresh to review all three networks before continuing.</p>
        </>}
        {!executionReady && <button type='button' onClick={()=>void run()} disabled={busy} className={cta}>{busy?'Checking...':stage==='verified'?'Review balance migration':stage==='review'?'Refresh balances':'Verify updated wallets'}</button>}
        {stage!=='prepare' && <button type='button' onClick={goHome} disabled={busy} className='mt-3 min-h-12 w-full text-sm font-bold'>Back to Pocket</button>}
      </>}
    </article>
    {notice&&<p role='status' className='px-2 text-sm leading-6'>{notice}</p>}
    {error&&<p role='alert' className='px-2 text-sm leading-6 text-red-500'>{error}</p>}
  </section>
}
