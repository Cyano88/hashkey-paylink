import { useEffect, useState } from 'react'
// This deadline changes presentation only, never financial state. Fast terminal
// results render immediately; an unresolved operation can be left in Activity.
export default function usePocketSlowConfirmation(pending:boolean,identity:string,delayMs=60_000,activeCheck=false){
 const [elapsed,setElapsed]=useState('')
 useEffect(()=>{setElapsed('');if(!pending||!identity)return;const timer=window.setTimeout(()=>setElapsed(identity),delayMs);return()=>window.clearTimeout(timer)},[pending,identity,delayMs])
 return !activeCheck&&pending&&Boolean(identity)&&elapsed===identity
}
