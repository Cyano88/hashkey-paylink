import {createHash} from 'node:crypto'
import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'
import {applyMarketplaceCommand,createMarketplaceBook,createMarketplacePlan,marketplaceSellerBalances,type MarketplaceBook,type MarketplaceCommand} from './accounting.js'

// No server route imports this foundation. Live funding/signing is deliberately absent.
const KEY='hashpaylink:marketplace-accounting-foundation:v1'
export type MarketplaceStore={books:MarketplaceBook[];drafts:Array<{projectId:string;key:string;paymentId:string;hash:string}>}
const empty=():MarketplaceStore=>({books:[],drafts:[]})
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>}
const defaults:Dependencies={read:()=>readDurableJson<MarketplaceStore>(KEY),mutate:fn=>mutateDurableJson<MarketplaceStore>(KEY,current=>fn(current||empty()))}
export function createMarketplaceRepository(dependencies:Partial<Dependencies>={}){
 const d={...defaults,...dependencies}
 return {
  async create(input:Parameters<typeof createMarketplacePlan>[0],key:string){
   if(!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/.test(key))throw Error('Invalid idempotency key.')
   const plan=createMarketplacePlan(input),hash=createHash('sha256').update(JSON.stringify(plan)).digest('hex')
   const store=await d.mutate(s=>{
    const replay=s.drafts.find(x=>x.projectId===plan.projectId&&x.key===key)
    if(replay){if(replay.hash!==hash)throw Error('Idempotency key was used for a different draft.');return s}
    if(s.books.some(b=>b.plan.projectId===plan.projectId&&b.plan.paymentId===plan.paymentId))throw Error('Payment reference already exists.')
    s.books.push(createMarketplaceBook(plan));s.drafts.push({projectId:plan.projectId,key,paymentId:plan.paymentId,hash});return s
   })
   return structuredClone(store.books.find(b=>b.plan.projectId===plan.projectId&&b.plan.paymentId===plan.paymentId)!)
  },
  async execute(projectId:string,paymentId:string,key:string,command:MarketplaceCommand){
   const store=await d.mutate(s=>{
    const index=s.books.findIndex(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
    if(index<0)throw Error('Marketplace payment not found.')
    // Proof references must be canonical chain/log or provider settlement identities.
    if(command.type==='fund'&&s.books.some((b,i)=>i!==index&&b.fundingEvidence===command.evidenceId))throw Error('Funding evidence was already used.')
    if(command.type==='result'&&command.status!=='unknown'&&s.books.some((b,i)=>i!==index&&b.operations.some(o=>o.evidenceId===command.evidenceId)))throw Error('Execution evidence was already used.')
    s.books[index]=applyMarketplaceCommand(s.books[index],projectId,key,command);return s
   })
   return structuredClone(store.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)!)
  },
  async get(projectId:string,paymentId:string){return structuredClone((await d.read())?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)||null)},
  async sellerBalances(projectId:string,sellerId:string){return marketplaceSellerBalances((await d.read())?.books||[],projectId,sellerId)},
 }
}
