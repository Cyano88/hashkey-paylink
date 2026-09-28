import {useEffect,useRef} from 'react'
import {POCKET_NATIVE_BACK_EVENT} from '../lib/pocketNativeBack'
/** Sheets own native Back while open; otherwise unwind the current XPay step. */
export default function usePocketXPayBack(back:()=>void){
 const callback=useRef(back);callback.current=back
 useEffect(()=>{const handle=(event:Event)=>{if(event.defaultPrevented||document.querySelector('[role="dialog"]'))return;event.preventDefault();callback.current()};window.addEventListener(POCKET_NATIVE_BACK_EVENT,handle);return()=>window.removeEventListener(POCKET_NATIVE_BACK_EVENT,handle)},[])
}
