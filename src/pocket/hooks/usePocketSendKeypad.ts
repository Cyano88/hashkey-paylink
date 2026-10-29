import {useCallback,useEffect,useLayoutEffect,useState,useRef} from 'react'
import {POCKET_NATIVE_BACK_EVENT} from '../lib/pocketNativeBack'
export default function usePocketSendKeypad(){
 const [open,setOpen]=useState(false)
 const pointerStartedInside=useRef(false)
 useEffect(()=>{
  // Opening the keypad can move the amount field before pointerup. Keep the
  // activation tap bound to its starting control instead of dismissing it.
  const start=(event:PointerEvent)=>{const target=event.target;pointerStartedInside.current=target instanceof Element&&!!target.closest('[data-pocket-send-amount], [aria-label="Amount keypad"], .pocket-keypad-dock')}
  document.addEventListener('pointerdown',start,true)
  return()=>document.removeEventListener('pointerdown',start,true)
 },[])
 const show=useCallback(()=>setOpen(true),[])
 useLayoutEffect(()=>{
  if(!open)return
  const reveal=()=>{
   const field=document.activeElement?.closest<HTMLElement>('[data-pocket-send-amount]')
   const scroller=field?.closest<HTMLElement>('.pocket-keypad-fields, .pocket-form-fields')
   if(!field||!scroller)return
   const box=field.getBoundingClientRect(),visible=scroller.getBoundingClientRect()
   if(box.bottom>visible.bottom-12)scroller.scrollTop+=box.bottom-visible.bottom+12
   else if(box.top<visible.top+12)scroller.scrollTop+=box.top-visible.top-12
  }
  const frame=requestAnimationFrame(reveal)
  window.visualViewport?.addEventListener('resize',reveal)
  return()=>{cancelAnimationFrame(frame);window.visualViewport?.removeEventListener('resize',reveal)}
 },[open])
 useEffect(()=>{
  if(!open)return
  // Dismiss after a completed tap, not pointerdown: a touch may become a scroll.
  // Exclude the dock so the CTA cannot move away during its own tap.
  const outside=(event:Event)=>{if(event.type==='click'&&pointerStartedInside.current){pointerStartedInside.current=false;return}const target=event.target;if(target instanceof Element&&!target.closest('[data-pocket-send-amount], [aria-label="Amount keypad"], .pocket-keypad-dock'))setOpen(false)}
  const back=(event:Event)=>{if(document.querySelector('[role="dialog"]'))return;event.preventDefault();event.stopImmediatePropagation();setOpen(false);if(document.activeElement instanceof HTMLInputElement)document.activeElement.blur()}
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')back(event)}
  document.addEventListener('click',outside,true);document.addEventListener('focusin',outside,true);window.addEventListener(POCKET_NATIVE_BACK_EVENT,back,true);document.addEventListener('keydown',key,true)
  return()=>{document.removeEventListener('click',outside,true);document.removeEventListener('focusin',outside,true);window.removeEventListener(POCKET_NATIVE_BACK_EVENT,back,true);document.removeEventListener('keydown',key,true)}
 },[open])
 return {open,show}
}
