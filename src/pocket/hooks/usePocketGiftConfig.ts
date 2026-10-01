import {useEffect,useRef,useState} from 'react'
import {readPocketGiftConfig,type PocketGiftConfig} from '../api/pocketGiftsClient'
const cache=new Map<string,{value?:PocketGiftConfig;updated:number;pending?:Promise<PocketGiftConfig>}>()
export default function usePocketGiftConfig(owner:string|null,ready:boolean,getAccessToken:()=>Promise<string|null>){
 const token=useRef(getAccessToken);token.current=getAccessToken
 const [,render]=useState(0),[error,setError]=useState('')
 const entry=owner?cache.get(owner):undefined
 useEffect(()=>{if(!ready||!owner)return;let active=true;setError('');let current=cache.get(owner)
 if(current?.value&&Date.now()-current.updated<30000)return
 if(!current){current={updated:0};cache.set(owner,current)}
 const target=current
 if(!target.pending)target.pending=token.current().then(access=>{if(!access)throw Error('Sign in to continue.');return readPocketGiftConfig(fetch,access)}).then(value=>{target.value=value;target.updated=Date.now();return value}).finally(()=>{target.pending=undefined})
 void target.pending.then(()=>{if(active)render(n=>n+1)}).catch(()=>{if(active)setError('Gifts are temporarily unavailable.')})
 return()=>{active=false}
 },[owner,ready])
 return {config:entry?.value,loading:!entry?.value&&!error,error}
}
