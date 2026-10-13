import {useEffect,useRef} from 'react'
import {Capacitor} from '@capacitor/core'
import {Haptics,ImpactStyle} from '@capacitor/haptics'

/** One gentle pulse for this success surface, including React effect replays. */
export default function usePocketSuccessHaptic(successful:boolean){
 const played=useRef(false)
 useEffect(()=>{
  if(!successful||played.current)return
  played.current=true
  if(Capacitor.isNativePlatform())void Haptics.impact({style:ImpactStyle.Light}).catch(()=>{})
  else if(typeof navigator!=='undefined'&&'vibrate' in navigator)navigator.vibrate(8)
 },[successful])
}
