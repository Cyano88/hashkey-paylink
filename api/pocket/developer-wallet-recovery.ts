import {isEvmReplacementCandidate} from '../../src/lib/circleEvmReplacement.js'
import type {CircleEvmWalletRecord} from '../../src/lib/circleEvmWalletTopology.js'
import {additionalBlockchain,type AdditionalNetwork} from './wallet-additional-alignment.js'

// Receiving setup restores one unambiguous original wallet; it never migrates it.
export function developerAdditionalWallet(inventory:CircleEvmWalletRecord[],network:AdditionalNetwork){
 const fail=()=>{throw Object.assign(Error('Your '+(network==='ethereum'?'Ethereum':'Polygon')+' wallet history needs review. Contact support; your existing wallets are unchanged.'),{status:409})}
 if(inventory.length>=50||new Set(inventory.map(w=>w.id)).size!==inventory.length)fail()
 const original=inventory.filter(w=>w.blockchain===additionalBlockchain[network]&&!isEvmReplacementCandidate(w))
 if(original.length>1)fail()
 const wallet=original[0]
 if(wallet&&(wallet.accountType!=='SCA'||wallet.state!=='LIVE'||!/^0x[\da-f]{40}$/i.test(wallet.address)||/^0x0{40}$/i.test(wallet.address)))fail()
 return wallet
}
