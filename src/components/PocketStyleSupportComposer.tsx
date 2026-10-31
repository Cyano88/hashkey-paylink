import {useLayoutEffect,useRef} from 'react'
import DynamicSendButton from './DynamicSendButton'
import '../pocket/components/pocketSupportChat.css'

export default function PocketStyleSupportComposer({value,onChange,onSend,busy,disabled=false}:{value:string;onChange:(value:string)=>void;onSend:()=>void;busy:boolean;disabled?:boolean}){
 const input=useRef<HTMLTextAreaElement>(null)
 useLayoutEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=Math.min(input.current.scrollHeight,116)+'px'}},[value])
 function send(){if(!busy&&!disabled&&value.trim())onSend()}
 return <form className="pocket-support-composer" onSubmit={event=>{event.preventDefault();send()}}>
  <div className="pocket-support-input-wrap">
   <textarea ref={input} rows={1} aria-label="Write a message" placeholder={disabled?'This conversation is closed.':'Message...'} value={value} maxLength={1500} disabled={busy||disabled} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send()}}} className="pocket-support-input"/>
   <DynamicSendButton inputText={value} isLoading={busy} canStop={false} onSend={send} onStop={()=>{}} idleLabel="Write a message" onAddAttachment={()=>input.current?.focus()} disabled={disabled} className="absolute bottom-1 right-1"/>
  </div>
  <p className="mt-2 text-[11px] text-gray-400">Never share a PIN, password, sign-in code or API key.</p>
 </form>
}
