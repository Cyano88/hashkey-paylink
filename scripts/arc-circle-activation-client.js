import {connectCircleEvmEmailWallet,deployCircleEvmEmailWallet} from '../src/lib/circleEvmEmailWallet'
const $=id=>document.getElementById(id)
let expected,session,busy=false,pending=false
const show=text=>{$('status').textContent=text}
async function refresh(){
 const response=await fetch('/status',{cache:'no-store'});if(!response.ok)throw Error('Could not check Arc wallet state.')
 const status=await response.json();pending=status.requested
 if(status.deployed){$('activate').disabled=true;show('Wallet code is present on Arc. Activation submission is disabled. Return to the chat for independent verification.');return true}
 $('activate').disabled=!session||busy||pending
 if(pending)show('An activation request is recorded. Do not submit again. Return to the chat to check its outcome.')
 return false
}
$('connect').onclick=async()=>{
 if(busy)return;busy=true;$('connect').disabled=true;$('activate').disabled=true
 try{
  show('Complete the Circle email sign-in. Enter the code only in the Circle window.')
  const connected=await connectCircleEvmEmailWallet(expected.email,'arc')
  if(connected.chain!=='arc'||connected.wallet.id!==expected.walletId||connected.wallet.address.toLowerCase()!==expected.address.toLowerCase()||connected.wallet.blockchain!=='ARC')throw Error('Circle returned a different wallet. Activation is blocked.')
  session=connected;show('Seller wallet connected. Review activation to open the Circle confirmation.')
 }catch(error){session=undefined;show(error.message||'Circle connection failed.')}
 finally{busy=false;$('connect').disabled=false;await refresh().catch(error=>show(error.message))}
}
$('activate').onclick=async()=>{
 if(!session||busy||pending)return
 busy=true;$('activate').disabled=true;$('connect').disabled=true
 try{
  if(await refresh()||pending)return
  show('Review the Circle activation. Transfer amount: 0 USDC, to this same wallet. The Trade test has not started.')
  const hash=await deployCircleEvmEmailWallet({session})
  if(hash)$('result').textContent='Reported transaction: '+hash
  show('Circle confirmation returned. Checking deployment; SDK completion alone is not proof of activation.')
  await refresh()
 }catch(error){show((error.message||'Activation outcome is uncertain.')+' Return to the chat for recovery; do not create another request.')}
 finally{busy=false;$('connect').disabled=false;await refresh().catch(error=>show(error.message))}
}
$('refresh').onclick=()=>refresh().catch(error=>show(error.message))
;(async()=>{
 try{
  expected=await(await fetch('/expected')).json();$('email').textContent=expected.email;$('wallet').textContent=expected.address
  $('connect').disabled=false;show('Sign in as the seller to activate the existing Arc wallet.');await refresh()
 }catch(error){show(error.message||'Activation page unavailable.')}
})()
