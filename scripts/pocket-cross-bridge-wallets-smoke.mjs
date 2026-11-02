import assert from 'node:assert/strict'
import {resolveCrossBridgeWallets,revalidateCrossBridgeWallets} from '../api/pocket/cross-bridge-wallets.ts'
import {CROSS_BRIDGE_NETWORKS} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
const owner='did:privy:bridge-fixture',evm='0x1111111111111111111111111111111111111111',sol='9xQeWvG816bUx9EPfEZzdCwkR18S5HkQmVmR9qVvB9S3'
const chains={ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC',arc:'ARC',solana:'SOL'}
const user={id:owner,linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',id:'privy-wallet',address:evm}]}
const circle=async key=>{const network=key.split(':').at(-1).replace('arc-mainnet','arc');return{privyUserId:owner,chain:network,purpose:'payment',circleWalletId:'circle-'+network,circleWalletAddress:network==='solana'?sol:evm,circleBlockchain:chains[network],updatedAt:1}}
const deps={circle,user:async()=>structuredClone(user)}
let count=0
for(const source of CROSS_BRIDGE_NETWORKS)for(const destination of CROSS_BRIDGE_NETWORKS){if(source===destination)continue;const b=await resolveCrossBridgeWallets(owner,source,destination,deps);assert.equal(b.source.network,source);assert.equal(b.destination.network,destination);assert.equal(b.source.provider,['bsc','xlayer'].includes(source)?'privy':'circle');assert.deepEqual(await revalidateCrossBridgeWallets(b,deps),b);count++}
for(const patch of [r=>r.privyUserId='other',r=>r.purpose='agent',r=>r.chain='polygon',r=>r.circleBlockchain='BASE-SEPOLIA',r=>r.circleWalletId='',r=>r.circleWalletAddress='0x'+'0'.repeat(40)])await assert.rejects(()=>resolveCrossBridgeWallets(owner,'base','bsc',{...deps,circle:async k=>{const r=await circle(k);patch(r);return r}}),e=>e.code==='bridge_wallet_changed')
for(const patch of [u=>u.id='other',u=>u.linkedAccounts=[],u=>u.linkedAccounts.push({...u.linkedAccounts[0]}),u=>u.linkedAccounts[0].walletClientType='metamask',u=>u.linkedAccounts[0].id=''])await assert.rejects(()=>resolveCrossBridgeWallets(owner,'bsc','base',{...deps,user:async()=>{const u=structuredClone(user);patch(u);return u}}),e=>e.code==='bridge_wallet_changed')
const binding=await resolveCrossBridgeWallets(owner,'base','bsc',deps)
await assert.rejects(()=>revalidateCrossBridgeWallets(binding,{...deps,circle:async k=>({...await circle(k),circleWalletId:'rotated'})}),e=>e.code==='bridge_wallet_changed')
await assert.rejects(()=>revalidateCrossBridgeWallets({...binding,source:{...binding.source,address:'0x'+'2'.repeat(40)}},deps),e=>e.code==='bridge_wallet_changed')
await assert.rejects(()=>resolveCrossBridgeWallets(owner,'solana','base',{...deps,circle:async k=>({...await circle(k),circleWalletAddress:'11111111111111111111111111111111'})}),e=>e.code==='bridge_wallet_changed')
console.log('PASS '+count+' wallet directions; owner, payment purpose, mainnet, wallet rotation, duplicate/external Privy accounts and invalid addresses rejected. Fixtures only.')
