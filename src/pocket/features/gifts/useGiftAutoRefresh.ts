import {useEffect,useRef} from 'react'
import {startGiftAutoRefresh} from './giftAutoRefresh'
export function useGiftAutoRefresh(enabled:boolean,refresh:()=>Promise<void>){
 const latest=useRef(refresh);latest.current=refresh
 useEffect(()=>{if(!enabled)return
  const poller=startGiftAutoRefresh(()=>latest.current(),{canRefresh:()=>document.visibilityState!=='hidden'&&navigator.onLine!==false})
  const resume=()=>{if(document.visibilityState!=='hidden')poller.checkNow()}
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume)
  return()=>{poller.dispose();window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume)}
 },[enabled])
}
