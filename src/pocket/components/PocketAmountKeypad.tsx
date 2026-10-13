import type {KeyboardEvent} from 'react'

export function editPocketAmount(value:string,key:string,decimals=6){
 if(key==='Backspace')return value.slice(0,-1)
 if(key==='Delete')return ''
 if(!/^[0-9.]$/.test(key))return value
 if(key==='.'&&value.includes('.'))return value
 const next=key==='.'&&!value?'0.':value==='0'&&key!=='.'?key:value+key
 return next.length>20||(next.split('.')[1]?.length||0)>decimals?value:next
}
export function pocketAmountKeyDown(event:KeyboardEvent<HTMLInputElement>,value:string,onChange:(value:string)=>void,decimals=6){
 if(event.ctrlKey||event.metaKey||event.altKey)return
 if(/^[0-9.]$/.test(event.key)||['Backspace','Delete'].includes(event.key)){
  event.preventDefault()
  const selected=event.currentTarget.selectionStart===0&&event.currentTarget.selectionEnd===value.length
  onChange(editPocketAmount(selected?'':value,event.key,decimals))
 }
}
export default function PocketAmountKeypad({value,onChange,disabled=false,decimals=6}:{value:string;onChange(value:string):void;disabled?:boolean;decimals?:number}){
 return <div role="group" aria-label="Amount keypad" className="grid shrink-0 grid-cols-3 gap-x-3 gap-y-1 pt-2">
  {['1','2','3','4','5','6','7','8','9','.','0','Backspace'].map(key=><button key={key} type="button" disabled={disabled} aria-label={key==='Backspace'?'Delete digit':key==='.'?'Decimal point':key} onClick={()=>onChange(editPocketAmount(value,key,decimals))} className="flex h-[clamp(44px,6dvh,56px)] touch-manipulation items-center justify-center rounded-2xl text-2xl font-medium text-gray-950 active:bg-gray-200 disabled:opacity-30 dark:text-white dark:active:bg-white/10">
   {key==='Backspace'?<svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-7-7 7-7Z" strokeLinejoin="round"/><path d="m12 9 6 6m0-6-6 6" strokeLinecap="round"/></svg>:key}
  </button>)}
 </div>
}
