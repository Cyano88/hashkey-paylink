import {isAddress, getAddress} from 'viem'
import {PublicKey} from '@solana/web3.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

/** Shared recipient configuration; LI.FI activation is independently gated. */
export function readBridgeRevenueConfig(env:NodeJS.ProcessEnv=process.env){
  const issues:string[]=[]
  const bpsText=(env.POCKET_BRIDGE_REVENUE_BPS??'10').trim()
  const bps=/^(0|[1-9]\d*)$/.test(bpsText)?Number(bpsText):NaN
  if(!Number.isSafeInteger(bps)||bps<0||bps>100)issues.push('Bridge revenue must be an integer from 0 to 100 basis points.')
  const evm=(env.POCKET_BRIDGE_REVENUE_EVM_ADDRESS||'').trim()
  const solana=(env.POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS||'').trim()
  if(!isAddress(evm)||/^0x0{40}$/i.test(evm))issues.push('A valid nonzero bridge revenue EVM address is required.')
  const reimbursementEvm=[EVM_PLATFORM_TREASURY,env.TREASURY_ADDRESS].filter(Boolean)
  if(evm&&reimbursementEvm.some(address=>address!.toLowerCase()===evm.toLowerCase()))issues.push('Bridge revenue EVM address must differ from the reimbursement treasury.')
  try{
    const key=new PublicKey(solana)
    if(key.toBase58()!==solana||key.equals(PublicKey.default))throw Error('invalid')
  }catch{issues.push('A valid nonzero bridge revenue Solana address is required.')}
  if(solana&&solana===(env.SOLANA_TREASURY||'').trim())issues.push('Bridge revenue Solana address must differ from the reimbursement treasury.')
  return {collectionEnabled:env.POCKET_BRIDGE_REVENUE_LIFI_ENABLED==='true'&&issues.length===0,bps:Number.isSafeInteger(bps)?bps:null,evmAddress:isAddress(evm)?getAddress(evm):null,solanaAddress:solana||null,configurationValid:issues.length===0,issues}
}

/** Six-decimal stablecoin units; round down without floating-point amounts. */
export function bridgeRevenueUnits(amountUnits:bigint,bps:number){
  if(amountUnits<=0n||amountUnits>=2n**256n||!Number.isSafeInteger(bps)||bps<0||bps>100)throw Error('Invalid bridge revenue calculation.')
  return amountUnits*BigInt(bps)/10000n
}

export type EvmBridgeRevenue={recipient:`0x${string}`;bps:number;amountUnits:string}

/** Snapshot into the signed quote. Never re-read a recipient during execution. */
export function evmBridgeRevenue(amountUnits:bigint,env:NodeJS.ProcessEnv=process.env):EvmBridgeRevenue{
  const config=readBridgeRevenueConfig(env)
  if(!config.configurationValid||!config.evmAddress||config.bps===null)throw Error('Bridge revenue configuration is invalid.')
  return {recipient:config.evmAddress,bps:config.bps,amountUnits:bridgeRevenueUnits(amountUnits,config.bps).toString()}
}

export function validateEvmBridgeRevenue(revenue:EvmBridgeRevenue,principal:bigint,sender:string){
  if(!revenue||!isAddress(revenue.recipient)||/^0x0{40}$/i.test(revenue.recipient)
    ||[sender,EVM_PLATFORM_TREASURY].some(address=>address.toLowerCase()===revenue.recipient.toLowerCase())
    ||revenue.amountUnits!==bridgeRevenueUnits(principal,revenue.bps).toString())throw Error('Bridge revenue binding mismatch.')
}
