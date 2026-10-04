import { encodeAbiParameters, encodeFunctionData, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import {arcTradeClient} from './arc-client.js'
import { ARC_AGREEMENT_NETWORK } from '../arc-agreement-config.js'
import { ARC_TRADE_POLICY, ARC_TRADE_RELEASE, arcTradeAvailability, type ArcTradeRelease, type bindArcTradeTerms } from './arc.js'
import { ARC_TRADE_FACTORY_ABI, address, unsigned, verifyArcTradeFactory, verifyArcTradeAuthority, type ArcTradeReader } from './arc-verification.js'
import { tradeLifecycleActions } from './lifecycle.js'
import { TRADE_ESCROW_ABI, TRADE_TOKEN_ABI, type TradeXLayerAction, type TradeXLayerStatus } from '../../src/lib/xstocksAgreement/protocol.js'

export type ArcTradeBinding = ReturnType<typeof bindArcTradeTerms>
export type ArcTradeStatus = Omit<TradeXLayerStatus,'stockReceipt'|'transaction'> & {
  transaction?: {account:Address;to:Address;data:Hex;chainId:5042;value:'0'}
}
type Plan = {binding:ArcTradeBinding;account:Address;action?:TradeXLayerAction;evidence?:unknown;settlement?:unknown}
const starts = new Set<TradeXLayerAction>(['create','accept','approve','fund'])
const bytes32 = (value:unknown): value is Hex => typeof value === 'string' && /^0x[a-f0-9]{64}$/i.test(value) && !/^0x0{64}$/i.test(value)
function note(value:unknown): Hex {
  if (typeof value !== 'string' || value.trim().length < 10 || value.length > 2000) throw Error('Add a reference or explanation of 10 to 2000 characters.')
  return keccak256(stringToHex(value.trim()))
}
export async function prepareArcTradeAction(input: Plan & {env:NodeJS.ProcessEnv;projectId:string}): Promise<ArcTradeStatus> {
  if (!ARC_TRADE_RELEASE) {
    if (input.action) throw Object.assign(Error('Arc Trade deployment is pending verification.'),{status:409})
    return {enabled:false,actions:[],fundingIssue:'Arc Trade deployment is pending verification.'}
  }
  const client = arcTradeClient(input.env)
  return planArcTradeCandidate({...input,fundingEnabled:arcTradeAvailability(input.env,input.projectId).enabled},client as ArcTradeReader,ARC_TRADE_RELEASE)
}
// Read/simulate only. Injectable reviewed candidate and reader support isolated
// deployment rehearsal. HTTP callers must use prepareArcTradeAction.
export async function planArcTradeCandidate(input: Plan & {fundingEnabled:boolean}, client: ArcTradeReader, release: ArcTradeRelease): Promise<ArcTradeStatus> {
  const b=input.binding,t=b.contractTerms,account=address(input.account)
  if (b.policy!==ARC_TRADE_POLICY || b.chainId!==5042 || (b as {custody?:unknown}).custody!==undefined
    || address(b.factory)!==address(release.factory) || address(t.arbiter)!==address(release.arbiter)
    || address(t.token)!==ARC_AGREEMENT_NETWORK.usdc || t.decimals!==6 || b.termsHash!==t.termsHash
    || !bytes32(t.termsHash) || !bytes32(t.offerId) || !/^[1-9][0-9]{0,77}$/.test(t.amount) || BigInt(t.amount)>=2n**256n
    || !Number.isSafeInteger(t.fundBy) || t.fundBy<=0
    || !Number.isInteger(t.dispatchWindow) || t.dispatchWindow<86400 || t.dispatchWindow>30*86400
    || !Number.isInteger(t.deliveryWindow) || t.deliveryWindow<86400 || t.deliveryWindow>60*86400
    || ![86400,172800,259200].includes(t.inspectionWindow)) throw Error('Arc Trade binding mismatch.')
  const roles=[t.buyer,t.seller,t.arbiter,b.factory,t.token].map(address)
  if (roles.includes(zeroAddress) || new Set(roles).size!==roles.length) throw Error('Invalid Arc Trade roles.')
  const buyer=account===roles[0]
  if (!buyer && account!==roles[1]) throw Error('This wallet is not a Trade participant.')
  const head=await client.getBlockNumber({cacheTime:0})
  if(head<6n)throw Error('Confirmed Arc Trade state is unavailable.')
  const blockNumber=head-5n,block=await client.getBlock({blockNumber})
  await verifyArcTradeFactory(client,release,blockNumber)
  const finish=async(result:ArcTradeStatus) => {
    if(!block.hash || (await client.getBlock({blockNumber})).hash!==block.hash || await client.getChainId()!==5042)throw Error('Arc Trade chain state changed. Refresh.')
    return result
  }
  const read=(target:Address,functionName:string,args?:readonly unknown[],latest=false,abi=TRADE_ESCROW_ABI as readonly unknown[]) =>
    client.readContract({address:target,abi:abi as Parameters<ArcTradeReader['readContract']>[0]['abi'],functionName,args,blockNumber:latest?undefined:blockNumber})
  const key=keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'bytes32'}],[t.seller,t.buyer,t.offerId]))
  const escrow=address(await read(release.factory,'escrows',[key],false,ARC_TRADE_FACTORY_ABI))
  const result:ArcTradeStatus={enabled:input.fundingEnabled,observedBlock:String(blockNumber),escrow,amount:t.amount,token:t.token,decimals:6,actions:[]}
  if(escrow!==address(await read(release.factory,'escrows',[key],true,ARC_TRADE_FACTORY_ABI)))return finish({...result,pending:true})
  if(escrow===zeroAddress) {
    result.fundingExpired=BigInt(t.fundBy)<=block.timestamp
    if(!buyer&&!result.fundingExpired)result.actions=['create']
  } else {
    const names=['offerId','termsHash','buyer','seller','arbiter','token','amount','fundBy','dispatchWindow','deliveryWindow','inspectionWindow'] as const
    const values=await Promise.all(names.map(name=>read(escrow,name)))
    for(const [index,name] of names.entries())if(String(values[index]).toLowerCase()!==String(t[name]).toLowerCase())throw Error('Arc Trade escrow terms mismatch: '+name)
    const state=Number(unsigned(await read(escrow,'state')))
    if(state>9)throw Error('Unknown Arc Trade escrow state.')
    result.state=state;result.fundingExpired=state<=1&&BigInt(t.fundBy)<=block.timestamp
    if(state!==Number(unsigned(await read(escrow,'state',undefined,true))))return finish({...result,pending:true})
    const [dispatchBy,deliveryBy,inspectUntil]=await Promise.all(['dispatchBy','deliveryBy','inspectUntil'].map(async name=>unsigned(await read(escrow,name))))
    result.actions=tradeLifecycleActions(state,buyer,block.timestamp,{fundBy:BigInt(t.fundBy),dispatchBy,deliveryBy,inspectUntil})
    if(state===5) {
      const names=['settlementNonce','proposedBuyerAmount','settlementEvidence','settlementProposer']
      const saved=await Promise.all(names.map(name=>read(escrow,name))),latest=await Promise.all(names.map(name=>read(escrow,name,undefined,true)))
      if(saved.some((value,index)=>String(value).toLowerCase()!==String(latest[index]).toLowerCase()))return finish({...result,actions:[],pending:true})
      const proposer=address(saved[3]),buyerAmount=unsigned(saved[1])
      if(buyerAmount>BigInt(t.amount) || typeof saved[2]!=='string' || !/^0x[a-f0-9]{64}$/i.test(saved[2]))throw Error('Invalid Arc settlement proposal.')
      result.settlement={nonce:String(unsigned(saved[0])),buyerAmount:String(buyerAmount),evidence:saved[2] as Hex,proposer}
      result.actions.push('proposeSettlement')
      if(proposer!==zeroAddress)result.actions.push(proposer===account?'withdrawSettlement':'acceptSettlement')
    }
    if(result.actions.includes('fund')) {
      const allowance=unsigned(await read(t.token,'allowance',[account,escrow],false,TRADE_TOKEN_ABI))
      if(allowance<BigInt(t.amount))result.actions=result.actions.map(action=>action==='fund'?'approve':action)
    }
  }
  // Authority drift disables new money only; participant recovery must survive.
  if(input.fundingEnabled && result.actions.some(action=>starts.has(action))) {
    try {
      await verifyArcTradeAuthority(client,release,blockNumber)
      await verifyArcTradeAuthority(client,release)
    } catch {
      result.enabled=false;result.fundingIssue='Arc Trade reviewer authority could not be verified. New funding is paused.'
    }
  }
  if(!result.enabled)result.actions=result.actions.filter(action=>!starts.has(action))
  const action=input.action
  if(!action)return finish(result)
  if(!result.actions.includes(action))throw Error('This Arc Trade action is not available. Refresh.')
  let to=escrow,data:Hex
  if(action==='create') {
    to=release.factory;data=encodeFunctionData({abi:ARC_TRADE_FACTORY_ABI,functionName:'create',args:[{...t,amount:BigInt(t.amount),fundBy:BigInt(t.fundBy)}]})
  } else if(action==='approve') {
    const allowance=unsigned(await read(t.token,'allowance',[account,escrow],true,TRADE_TOKEN_ABI))
    to=t.token;data=encodeFunctionData({abi:TRADE_TOKEN_ABI,functionName:'approve',args:[escrow,allowance===0n?BigInt(t.amount):0n]})
  } else if(action==='accept'||action==='fund') {
    data=encodeFunctionData({abi:TRADE_ESCROW_ABI,functionName:action==='accept'?'acceptTerms':'fund',args:[t.termsHash]})
  } else if(action==='dispatch'||action==='refund'||action==='dispute') {
    data=encodeFunctionData({abi:TRADE_ESCROW_ABI,functionName:action==='dispatch'?'markDispatched':action==='refund'?'refundBySeller':'openDispute',args:[note(input.evidence)]})
  } else if(action==='proposeSettlement'||action==='withdrawSettlement'||action==='acceptSettlement') {
    const reviewed=input.settlement as {nonce?:unknown;buyerAmount?:unknown;evidence?:unknown}|undefined,proposal=result.settlement
    if(!proposal||!reviewed||reviewed.nonce!==proposal.nonce)throw Error('The proposal changed. Review it again.')
    if(action==='proposeSettlement') {
      if(typeof reviewed.buyerAmount!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(reviewed.buyerAmount)||BigInt(reviewed.buyerAmount)>BigInt(t.amount))throw Error('Invalid buyer split amount.')
      data=encodeFunctionData({abi:TRADE_ESCROW_ABI,functionName:'proposeSettlement',args:[BigInt(reviewed.buyerAmount),note(input.evidence)]})
    } else {
      if(reviewed.buyerAmount!==proposal.buyerAmount||reviewed.evidence!==proposal.evidence)throw Error('The proposal changed. Review it again.')
      data=action==='withdrawSettlement'?encodeFunctionData({abi:TRADE_ESCROW_ABI,functionName:'withdrawSettlement',args:[BigInt(proposal.nonce)]})
        :encodeFunctionData({abi:TRADE_ESCROW_ABI,functionName:'acceptSettlement',args:[BigInt(proposal.nonce),BigInt(proposal.buyerAmount),proposal.evidence]})
    }
  } else {
    const functions={cancel:'cancelUnfunded',receipt:'confirmReceipt',release:'approveRelease',missedDispatch:'refundUndispatched',inspectionRelease:'releaseAfterInspection'} as const
    if(!(action in functions))throw Error('Unsupported Arc Trade action.')
    data=encodeFunctionData({abi:TRADE_ESCROW_ABI,functionName:functions[action as keyof typeof functions]})
  }
  await client.call({account,to,data,value:0n})
  result.transaction={account,to,data,chainId:5042,value:'0'}
  return finish(result)
}
