import {useEffect,useRef} from 'react'
import {Capacitor,registerPlugin} from '@capacitor/core'
import {Haptics,ImpactStyle} from '@capacitor/haptics'

const PocketHaptics=registerPlugin<{success():Promise<void>}>('PocketHaptics')

/** One gentle pulse for this success surface, including React effect replays. */
export default function usePocketSuccessHaptic(successful:boolean){
 const played=useRef(false)
 useEffect(()=>{
  if(!successful){played.current=false;return}
  if(played.current)return
  played.current=true
  if(Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('PocketHaptics'))void PocketHaptics.success().catch(()=>{})
  else if(Capacitor.isNativePlatform())void Haptics.impact({style:ImpactStyle.Light}).catch(()=>{})
  else if(typeof navigator!=='undefined'&&'vibrate' in navigator)navigator.vibrate(8)
 },[successful])
}
