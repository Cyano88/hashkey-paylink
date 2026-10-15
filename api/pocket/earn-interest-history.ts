export const EARN_RAY=10n**27n
export type EarnCheckpoint={block:string;hash:string;index:string;interest:string}
export type EarnBackfill={target:EarnCheckpoint;cursorBlock:string;cursorIndex:string;interest:string;base:EarnCheckpoint|null}
export type EarnLedger={version:1;checkpoint?:EarnCheckpoint;pending?:EarnBackfill;earnedUnits?:string;asOf?:number}
export type EarnHistoryReader={index(block:bigint):Promise<bigint>;hash(block:bigint):Promise<string>;interest(block:bigint,index:bigint):Promise<bigint>}
// User index changes only when Aave settles that user's accrued interest. Binary
// search these change blocks instead of scanning millions of empty RPC ranges.
export async function advanceEarnHistory(input:EarnLedger,target:EarnCheckpoint,reader:EarnHistoryReader,maxSteps=2):Promise<EarnLedger>{
 let state=structuredClone(input)
 for(const anchor of [state.checkpoint,state.pending?.target])if(anchor&&await reader.hash(BigInt(anchor.block))!==anchor.hash)state={version:1}
 const base=state.checkpoint||null
 if(!state.pending){
  if(base&&BigInt(target.index)<BigInt(base.index))throw Error('Earn index moved backwards')
  state.pending={target,cursorBlock:target.block,cursorIndex:target.index,interest:'0',base}
 }
 const p=state.pending,baseIndex=BigInt(p.base?.index||'0'),baseBlock=BigInt(p.base?.block||'0')
 for(let step=0;BigInt(p.cursorIndex)>baseIndex&&step<maxSteps;step++){
  const index=BigInt(p.cursorIndex)
  let low=baseBlock+1n,high=BigInt(p.cursorBlock)
  if(high<low||await reader.index(high)!==index)throw Error('Invalid Earn history boundary')
  while(low<high){const mid=(low+high)/2n,value=await reader.index(mid);if(value>index||value<baseIndex)throw Error('Invalid Earn historical index');if(value===index)high=mid;else low=mid+1n}
  const block=low,hash=await reader.hash(block),previous=await reader.index(block-1n)
  if(previous>=index||previous<baseIndex)throw Error('Incomplete Earn history')
  const interest=await reader.interest(block,index)
  if(interest<0n||await reader.hash(block)!==hash)throw Error('Earn history changed')
  p.interest=String(BigInt(p.interest)+interest);p.cursorIndex=String(previous);p.cursorBlock=String(block-1n)
 }
 if(BigInt(p.cursorIndex)===baseIndex){state.checkpoint={...p.target,interest:String(BigInt(p.base?.interest||'0')+BigInt(p.interest))};delete state.pending}
 return state
}
// AToken revision 5 uses floor rounding. Principal is never part of this total.
export function totalEarnInterest(settled:bigint,scaled:bigint,previousIndex:bigint,currentBalance:bigint){
 if([settled,scaled,previousIndex,currentBalance].some(n=>n<0n)||scaled>0n&&previousIndex<EARN_RAY)throw Error('Invalid Earn accounting state')
 const accrued=currentBalance-scaled*previousIndex/EARN_RAY
 if(accrued<0n)throw Error('Earn balance is inconsistent')
 return settled+accrued
}
