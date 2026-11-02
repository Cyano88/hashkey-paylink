import {isEvmReplacementCandidate} from '../../src/lib/circleEvmReplacement.js'
import {POCKET_CANONICAL_EVM_REF_ID,type CircleEvmWalletRecord} from '../../src/lib/circleEvmWalletTopology.js'
import {additionalBlockchain,type AdditionalNetwork} from './wallet-additional-alignment.js'

const valid = (wallet:CircleEvmWalletRecord) => wallet.accountType==='SCA' && wallet.state==='LIVE' && /^0x[\da-f]{40}$/i.test(wallet.address) && !/^0x0{40}$/i.test(wallet.address)
const canonical = (wallet:CircleEvmWalletRecord) => valid(wallet) && wallet.refId===POCKET_CANONICAL_EVM_REF_ID && wallet.scaCore==='circle_6900_singleowner_v4' && Number.isFinite(Date.parse(wallet.createDate??''))
const sameBatch = (left:CircleEvmWalletRecord,right:CircleEvmWalletRecord) => left.address.toLowerCase()===right.address.toLowerCase() && left.createDate===right.createDate

// Receiving setup restores an original wallet; it never migrates or replaces one.
export function developerAdditionalWallet(inventory:CircleEvmWalletRecord[],network:AdditionalNetwork,anchor?:CircleEvmWalletRecord){
 const fail=():never=>{throw Object.assign(Error('Your '+(network==='ethereum'?'Ethereum':'Polygon')+' wallet history needs review. Contact support; your existing wallets are unchanged.'),{status:409})}
 if(inventory.length>=50||new Set(inventory.map(w=>w.id)).size!==inventory.length)fail()
 const original=inventory.filter(w=>w.blockchain===additionalBlockchain[network]&&!isEvmReplacementCandidate(w))
 if(original.length>1){
  // Repeated canonical setup can leave two complete batches. The authenticated,
  // server-linked Base wallet identifies the active batch, never creation order.
  if(!anchor || anchor.blockchain!=='BASE' || !canonical(anchor))return fail()
  const bases=inventory.filter(w=>w.blockchain==='BASE'&&canonical(w))
  if(!bases.some(w=>w.id===anchor.id&&sameBatch(w,anchor)))return fail()
  if(original.some(w=>!canonical(w)||!bases.some(base=>sameBatch(base,w))))return fail()
  const matching=original.filter(w=>sameBatch(w,anchor))
  if(matching.length!==1)return fail()
  return matching[0]
 }
 const wallet=original[0]
 if(wallet&&!valid(wallet))fail()
 return wallet
}
