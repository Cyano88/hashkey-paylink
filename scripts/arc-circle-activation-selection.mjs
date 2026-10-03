export function selectActivationWallet(data,expected){
 const wallets=Array.isArray(data.wallets)?data.wallets:[]
 const matches=wallets.filter(wallet=>wallet.id===expected.walletId&&
  typeof wallet.address==='string'&&wallet.address.toLowerCase()===expected.address.toLowerCase()&&
  wallet.blockchain==='ARC'&&wallet.accountType==='SCA'&&wallet.state==='LIVE')
 if(matches.length!==1)return {ok:false,error:'The linked seller wallet is not uniquely available in this Circle session. Activation remains blocked. Return to the chat for account reconciliation.'}
 return {...data,wallet:matches[0],wallets:[matches[0]]}
}
