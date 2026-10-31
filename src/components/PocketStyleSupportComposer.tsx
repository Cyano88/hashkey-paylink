import {PaperClipIcon,XMarkIcon} from '@heroicons/react/24/outline'
import {SUPPORT_FILE_ACCEPT} from '../lib/supportAttachments'
import type {PendingSupportFile} from './useSupportFiles'
import {useLayoutEffect,useRef} from 'react'
import DynamicSendButton from './DynamicSendButton'
import '../pocket/components/pocketSupportChat.css'

export default function PocketStyleSupportComposer({value,onChange,onSend,busy,disabled=false,label='Write a message',privacyHint=true,onTyping,onStopTyping,files=[],onFiles,onRemoveFile}:{value:string;onChange:(value:string)=>void;onSend:()=>void;busy:boolean;disabled?:boolean;label?:string;privacyHint?:boolean;onTyping?:(hasText:boolean)=>void;onStopTyping?:()=>void;files?:PendingSupportFile[];onFiles?:(files:FileList)=>void;onRemoveFile?:(key:string)=>void}){
 const input=useRef<HTMLTextAreaElement>(null),picker=useRef<HTMLInputElement>(null)
 useLayoutEffect(()=>{if(input.current){input.current.style.height='auto';input.current.style.height=Math.min(input.current.scrollHeight,116)+'px'}},[value])
 function send(){if(!busy&&!disabled&&(value.trim()||files.length)){onStopTyping?.();onSend()}}
 return <form className="pocket-support-composer" onSubmit={event=>{event.preventDefault();send()}}>
  {files.length>0&&<div className="mb-2 space-y-2">{files.map(f=><div key={f.key} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2 text-xs dark:border-white/10">{f.preview?<img src={f.preview} alt="" className="h-9 w-9 rounded object-cover"/>:<PaperClipIcon className="h-5 w-5 shrink-0"/>}<span className="min-w-0 flex-1"><span className="block truncate">{f.file.name}</span><span className="text-gray-500">{Math.ceil(f.file.size/1024)} KB</span></span><button type="button" disabled={busy} aria-label={'Remove '+f.file.name} onClick={()=>onRemoveFile?.(f.key)}><XMarkIcon className="h-4 w-4"/></button></div>)}</div>}
  {onFiles&&<input ref={picker} type="file" multiple accept={SUPPORT_FILE_ACCEPT} aria-label="Attach images or documents" className="hidden" onChange={event=>{if(event.target.files)onFiles(event.target.files);event.target.value=''}}/>}
  <div className="pocket-support-input-wrap">
   {onFiles&&<button type="button" disabled={busy||disabled} aria-label="Attach files" title="Images, PDF or text - Up to 5 MB each" className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200/50" onClick={()=>picker.current?.click()}><PaperClipIcon className="h-5 w-5"/></button>}
   <textarea ref={input} rows={1} aria-label={label} placeholder={disabled?'This conversation is closed.':'Message...'} value={value} maxLength={1500} disabled={busy||disabled} onChange={event=>{onChange(event.target.value);onTyping?.(Boolean(event.target.value.trim()))}} onBlur={()=>onStopTyping?.()} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();send()}}} style={onFiles?{paddingLeft:48}:undefined} className="pocket-support-input"/>
   <DynamicSendButton inputText={value||(files.length||onFiles?'Attachment':'')} isLoading={busy} canStop={false} onSend={send} onStop={()=>{}} idleLabel={onFiles?'Attach files':'Write a message'} onAddAttachment={()=>onFiles?picker.current?.click():input.current?.focus()} disabled={disabled||Boolean(onFiles&&!value.trim()&&!files.length)} className="absolute bottom-1 right-1"/>
  </div>
  {privacyHint&&<p className="mt-2 text-[11px] text-gray-400">Never share a PIN, password, sign-in code or API key.</p>}
 </form>
}
