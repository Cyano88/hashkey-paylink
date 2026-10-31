import {useEffect,useRef,useState} from 'react'

// Presence never receives draft text. A stopped/hidden/unmounted composer clears it.
export function useSupportTyping(api:(typing?:boolean)=>Promise<{expiresIn?:number}>,enabled:boolean){
 const [peerTyping,setPeerTyping]=useState(false),change=useRef<(hasText:boolean)=>void>(()=>{}),stop=useRef<()=>void>(()=>{})
 useEffect(()=>{
  setPeerTyping(false)
  if(!enabled){change.current=()=>{};stop.current=()=>{};return}
  let alive=true,polling=false,sending=false,pending:boolean|undefined,lastPulse=0,hasPublished=false
  let idle:ReturnType<typeof setTimeout>|undefined,expiry:ReturnType<typeof setTimeout>|undefined
  const publish=(value:boolean)=>{pending=value;if(sending)return;void(async()=>{sending=true;try{while(pending!==undefined){const next=pending;pending=undefined;try{await api(next)}catch{/* Presence must not interrupt the conversation. */}}}finally{sending=false}})()}
  const stopTyping=()=>{clearTimeout(idle);if(hasPublished){publish(false);hasPublished=false}lastPulse=0}
  change.current=(hasText)=>{if(!hasText||document.hidden){stopTyping();return}clearTimeout(idle);const now=Date.now();if(now-lastPulse>=2500){publish(true);hasPublished=true;lastPulse=now}idle=setTimeout(stopTyping,3000)}
  stop.current=stopTyping
  const poll=async()=>{if(!alive||document.hidden||polling)return;polling=true;try{const result=await api();if(alive){clearTimeout(expiry);const duration=Math.min(8000,Math.max(0,result.expiresIn||0));setPeerTyping(duration>0);if(duration)expiry=setTimeout(()=>setPeerTyping(false),duration)}}catch{if(alive)setPeerTyping(false)}finally{polling=false}}
  const visibility=()=>{if(document.hidden){stopTyping();setPeerTyping(false)}else void poll()}
  void poll();const timer=setInterval(()=>void poll(),2500);document.addEventListener('visibilitychange',visibility)
  return()=>{alive=false;clearInterval(timer);clearTimeout(expiry);stopTyping();document.removeEventListener('visibilitychange',visibility);change.current=()=>{};stop.current=()=>{}}
 },[api,enabled])
 return {peerTyping,onTyping:(hasText:boolean)=>change.current(hasText),stopTyping:()=>stop.current()}
}
