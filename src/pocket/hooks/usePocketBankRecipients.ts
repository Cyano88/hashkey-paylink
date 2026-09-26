import { useCallback, useEffect, useRef, useState } from 'react'
import { POCKET_API } from '../lib/pocketSchemas'
export type PocketBankRecipient = { id: string; bankCode: string; bankName: string; accountNumber: string; accountName: string; lastUsedAt: number; favourite: boolean }
export default function usePocketBankRecipients({ email, enabled, getAccessToken }: { email: string; enabled: boolean; getAccessToken: () => Promise<string | null> }) {
  const [snapshot,setSnapshot] = useState<{scope:string;rows:PocketBankRecipient[]}>({scope:'',rows:[]}), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const scope = enabled ? email.toLowerCase() : ''
  const active = useRef(scope), sequence = useRef(0)
  active.current = scope
  const load = useCallback(async (recipient?: PocketBankRecipient) => {
    if (!scope) return
    const version = ++sequence.current
    const valid = () => active.current === scope && sequence.current === version
    setBusy(true); setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in to view your recipients.')
      if (!valid()) return
      const response = await fetch(POCKET_API.bankWithdraw, { method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+token}, body:JSON.stringify(recipient ? {action:'favouriteRecipient',recipientId:recipient.id,favourite:!recipient.favourite} : {action:'recipients'}), signal:AbortSignal.timeout(15000) })
      const result = await response.json().catch(()=>null)
      if (!response.ok || !Array.isArray(result?.data)) throw new Error(result?.error || 'Recipients could not load. Try again.')
      if (valid()) setSnapshot({scope,rows:result.data})
    } catch(reason) { if (valid()) setError(reason instanceof Error ? reason.message : 'Recipients could not load.') }
    finally { if (valid()) setBusy(false) }
  },[getAccessToken,scope])
  useEffect(()=>{setSnapshot({scope,rows:[]});setError('');void load();return()=>{sequence.current++}},[load])
  return {rows:snapshot.scope===scope?snapshot.rows:[],busy,error,refresh:()=>load(),toggle:(recipient:PocketBankRecipient)=>load(recipient)}
}
