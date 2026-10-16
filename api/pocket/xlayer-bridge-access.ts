/** Public rollout expands eligibility only; callers must still verify linked wallets. */
export function xlayerBridgeWalletEligible(wallet:string,env:Record<string,string|undefined>=process.env){
 if(env.POCKET_XLAYER_BRIDGE_ENABLED!=='true'||!/^0x[0-9a-f]{40}$/i.test(wallet)||/^0x0{40}$/i.test(wallet))return false
 if(env.POCKET_XLAYER_BRIDGE_PUBLIC_ENABLED==='true')return true
 return (env.POCKET_XLAYER_BRIDGE_WALLETS||'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean).includes(wallet.toLowerCase())
}
