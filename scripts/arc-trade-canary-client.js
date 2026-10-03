import {connectCircleEvmEmailWallet,executeCircleEvmEmailChallenge} from '../src/lib/circleEvmEmailWallet'
const role=location.pathname==='/buyer/'?'buyer':'seller',$=id=>document.getElementById(id)
const nativeFetch=window.fetch.bind(window)
window.fetch=(input,init={})=>{
 if(typeof input==='string'&&input==='/api/circle-solana-email'){
  const headers=new Headers(init.headers);headers.set('X-Canary-Role',role);return nativeFetch(input,{...init,headers})
 }
 return nativeFetch(input,init)
}
let session,expected,available,busy=false
const show=text=>{$('status').textContent=text}
async function api(path,body){
 const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify({...body,role})}:{})})
 const result=await response.json();if(!response.ok)throw Error(result.error||'Canary request failed.');return result
}
async function refresh(){
 const state=await api('/status?role='+role);available=state
 $('action').disabled=busy||!session||!state.action
 $('action').textContent=state.label||'Waiting for next step'
 $('escrow').textContent=state.escrow||'Not created'
 show(state.message)
 if(state.transactionHash)$('transaction').textContent=state.transactionHash
}
$('connect').onclick=async()=>{
 if(busy)return;busy=true;$('connect').disabled=true
 try{
  show('Complete Circle sign-in for '+expected.email)
  const result=await connectCircleEvmEmailWallet(expected.email,'arc')
  if(result.wallet.id!==expected.walletId||result.wallet.address.toLowerCase()!==expected.address.toLowerCase())throw Error('Wallet mismatch. Stop and return to the chat.')
  session=result
 }catch(error){show(error.message);return}
 finally{busy=false;$('connect').disabled=false}
 await refresh().catch(error=>show(error.message))
}
$('action').onclick=async()=>{
 if(busy||!session||!available?.action)return
 busy=true;$('action').disabled=true;$('connect').disabled=true
 try{
  show('Preparing the exact '+available.label+' request. Keep this page open.')
  const result=await api('/challenge',{userToken:session.userToken,action:available.action,termsHash:expected.termsHash})
  await executeCircleEvmEmailChallenge({session,challengeId:result.challengeId})
  show('Circle returned. Checking the transaction independently…')
  const state=await api('/reconcile',{userToken:session.userToken});show(state.message)
 }catch(error){show(error.message+' Use Check transaction; do not start a different request.')}
 finally{busy=false;$('connect').disabled=false;$('action').disabled=true}
}
$('refresh').onclick=async()=>{
 if(busy)return;busy=true;$('action').disabled=true
 try{if(session)await api('/reconcile',{userToken:session.userToken});await refresh()}
 catch(error){show(error.message)}finally{busy=false;if(available)$('action').disabled=!session||!available.action}
}
;(async()=>{
 try{
  expected=await api('/expected?role='+role)
  $('role').textContent=role;$('email').textContent=expected.email;$('wallet').textContent=expected.address
  $('terms').textContent=expected.termsHash;$('deadline').textContent=new Date(expected.fundBy*1000).toLocaleString()
  $('connect').disabled=false;await refresh()
 }catch(error){show(error.message)}
})()
