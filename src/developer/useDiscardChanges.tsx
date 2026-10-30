import {useEffect,useRef,useState} from 'react'

export default function useDiscardChanges(){
 const [open,setOpen]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef<((discard:boolean)=>void)|null>(null)
 function finish(discard:boolean){const resolve=pending.current;pending.current=null;setOpen(false);resolve?.(discard)}
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 useEffect(()=>()=>{pending.current?.(false);pending.current=null},[])
 function confirmDiscard(){if(pending.current)return Promise.resolve(false);return new Promise<boolean>(resolve=>{pending.current=resolve;setOpen(true)})}
 const discardDialog=<dialog ref={dialog} onCancel={event=>{event.preventDefault();finish(false)}} onClose={()=>{if(pending.current)finish(false)}} aria-labelledby="discard-changes-title" aria-describedby="discard-changes-description" className="w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-gray-950 shadow-xl backdrop:bg-black/40 dark:border-white/10 dark:bg-[#101114] dark:text-white">
  <h2 id="discard-changes-title" className="text-lg font-semibold">Discard changes?</h2>
  <p id="discard-changes-description" className="mt-3 text-sm leading-6 text-gray-500">Your unsaved edits will be lost.</p>
  <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" autoFocus onClick={()=>finish(false)} className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm font-medium dark:border-white/10">Keep editing</button><button type="button" onClick={()=>finish(true)} className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">Discard changes</button></div>
 </dialog>
 return {confirmDiscard,discardDialog}
}
