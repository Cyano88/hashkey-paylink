export type BscBalanceSnapshot={address:string|null;rows:{symbol:string;quantity:number;valueUsd:number}[];observedAt:number}
type State={snapshot?:BscBalanceSnapshot;busy:boolean;error:boolean;checkedAt:number}
/** One owner-scoped read shared by Home, chain selectors, and swap forms. */
export function createBscBalanceCache(){
 const entries=new Map<string,{state:State;pending?:Promise<void>;listeners:Set<()=>void>}>()
 const entry=(owner:string)=>{let value=entries.get(owner);if(!value){value={state:{busy:false,error:false,checkedAt:0},listeners:new Set()};entries.set(owner,value)}return value}
 const publish=(owner:string,state:State)=>{const e=entry(owner);e.state=state;e.listeners.forEach(fn=>fn())}
 return {
  read:(owner:string)=>entry(owner).state,
  subscribe(owner:string,fn:()=>void){const e=entry(owner);e.listeners.add(fn);return()=>{e.listeners.delete(fn)}},
  async load(owner:string,reader:()=>Promise<BscBalanceSnapshot>,force=false){
   const e=entry(owner)
   if(e.pending)return e.pending
   if(!force&&Date.now()-e.state.checkedAt<30000)return
   publish(owner,{...e.state,busy:true})
   e.pending=(async()=>{
    try{const snapshot=await reader();publish(owner,{snapshot,busy:false,error:false,checkedAt:Date.now()})}
    catch{publish(owner,{...e.state,busy:false,error:true,checkedAt:Date.now()})}
    finally{e.pending=undefined}
   })()
   return e.pending
  },
 }
}
export const pocketBscBalanceCache=createBscBalanceCache()
