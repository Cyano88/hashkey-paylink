'use strict';
const $=id=>document.getElementById(id),providers=[];
let provider,payload,busy=false,key;
const show=text=>{$('status').textContent=text},hex=n=>'0x'+n.toString(16);
window.addEventListener('eip6963:announceProvider',e=>{if(e.detail?.info?.rdns==='io.rabby'||e.detail?.provider?.isRabby)providers.push(e.detail.provider)});
window.dispatchEvent(new Event('eip6963:requestProvider'));
function pending(){const value=localStorage.getItem(key);if(value){show('Submission recorded: '+value+'. Check Rabby history before any further action.');$('deploy').disabled=true;return true}return false}
async function accountCheck(){
 if(BigInt(await provider.request({method:'eth_chainId'}))!==5042n)throw Error('Select Arc Mainnet (5042).');
 const accounts=await provider.request({method:'eth_accounts'});
 if(accounts[0]?.toLowerCase()!==payload.deployer.toLowerCase())throw Error('Select the specified Rabby account.');
}
$('connect').onclick=async()=>{try{
 provider=providers[0]||(window.ethereum?.isRabby?window.ethereum:window.ethereum?.providers?.find(p=>p.isRabby));
 if(!provider)throw Error('Open this link in the browser with Rabby installed.');
 await provider.request({method:'eth_requestAccounts'});
 await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x13b2'}]});
 await accountCheck();if(!pending()){$('deploy').disabled=false;show('Connected. Review creation will open Rabby after fresh checks.');}
 for(const event of ['accountsChanged','chainChanged'])provider.on?.(event,()=>{$('deploy').disabled=true;show('Wallet changed. Connect again.');});
}catch(error){show(error.message||'Connection failed.');}};
$('deploy').onclick=async()=>{
 if(busy||pending())return;busy=true;$('deploy').disabled=true;let requested=false;
 try{
  await accountCheck();show('Checking Arc contracts, prediction and gas…');
  const tx={from:payload.deployer,...(payload.mode==='factory'?{nonce:payload.transaction.nonce}:{to:payload.transaction.to}),data:payload.transaction.data,value:'0x0',chainId:'0x13b2'};
  if(ethers.keccak256(tx.data)!==payload.calldataHash)throw Error('Creation payload changed.');
  for(const dep of [payload.singleton,payload.proxyFactory]){
   const code=await provider.request({method:'eth_getCode',params:[dep.address,'latest']});
   if(ethers.keccak256(code)!==dep.runtimeHash)throw Error('Safe dependency bytecode changed.');
  }
  if(payload.mode==='factory'){
   const safeAbi=new ethers.Interface(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function masterCopy() view returns(address)','function getModulesPaginated(address,uint256) view returns(address[],address)']);
   const read=async(name,args=[])=>safeAbi.decodeFunctionResult(name,await provider.request({method:'eth_call',params:[{to:payload.predictedSafe,data:safeAbi.encodeFunctionData(name,args)},'latest']}));
   const code=await provider.request({method:'eth_getCode',params:[payload.predictedSafe,'latest']});
   if(ethers.keccak256(code)!==payload.proxyRuntimeHash)throw Error('Safe proxy changed.');
   const actualOwners=(await read('getOwners'))[0];
   if(JSON.stringify([...actualOwners].map(a=>a.toLowerCase()).sort())!==JSON.stringify([...payload.owners].map(a=>a.toLowerCase()).sort())||(await read('getThreshold'))[0]!==2n||(await read('masterCopy'))[0].toLowerCase()!==payload.singleton.address.toLowerCase())throw Error('Safe authority changed.');
   const modules=await read('getModulesPaginated',['0x0000000000000000000000000000000000000001',1]);
   if(modules[0].length||modules[1]!=='0x0000000000000000000000000000000000000001')throw Error('Safe modules changed.');
   for(const tag of ['latest','pending'])if(BigInt(await provider.request({method:'eth_getTransactionCount',params:[payload.deployer,tag]}))!==BigInt(tx.nonce))throw Error('Wallet nonce changed. Refresh the deployment plan.');
   if(await provider.request({method:'eth_getCode',params:[payload.predictedFactory,'latest']})!=='0x')throw Error('Factory already exists. Verify it before proceeding.');
   const runtime=await provider.request({method:'eth_call',params:[tx,'latest']});
   if(ethers.keccak256(runtime)!==payload.expectedRuntimeHash)throw Error('Factory constructor runtime changed.');
  }else{
  const code=await provider.request({method:'eth_getCode',params:[payload.predictedSafe,'latest']});
  if(code!=='0x')throw Error('Predicted Safe already has code. Stop and verify the existing deployment.');
  const simulated=await provider.request({method:'eth_call',params:[tx,'latest']});
  const predicted=ethers.AbiCoder.defaultAbiCoder().decode(['address'],simulated)[0];
  if(predicted.toLowerCase()!==payload.predictedSafe.toLowerCase())throw Error('Safe prediction changed.');
  }
  const gas=BigInt(await provider.request({method:'eth_estimateGas',params:[tx]}))*120n/100n;
  const price=BigInt(await provider.request({method:'eth_gasPrice'})),cost=gas*price;
  if(cost>BigInt(payload.maxGasCostWei))throw Error('Gas exceeds the displayed ceiling. Refresh the plan.');
  if(BigInt(await provider.request({method:'eth_getBalance',params:[tx.from,'latest']}))<cost)throw Error('Rabby needs more Arc USDC for gas.');
  await accountCheck();
  if(payload.mode==='factory'&&BigInt(await provider.request({method:'eth_getTransactionCount',params:[payload.deployer,'pending']}))!==BigInt(tx.nonce))throw Error('Wallet nonce changed before signing.');
  tx.gas=hex(gas);tx.gasPrice=hex(price);
  localStorage.setItem(key,'Pending Rabby response');requested=true;
  show('Review in Rabby. Value: 0 USDC. Maximum fee at requested gas/price: '+ethers.formatEther(cost)+' USDC.');
  const hash=await provider.request({method:'eth_sendTransaction',params:[tx]});
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Uncertain wallet response.');
  localStorage.setItem(key,hash);$('result').textContent=hash;
  const saved=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hash})});
  show(saved.ok?'Submitted. Keep this page open for independent chain verification.':'Submitted. Copy the transaction hash; local recording failed.');
 }catch(error){
  if(Number(error.code)===4001){localStorage.removeItem(key);requested=false;show('Rejected in Rabby.');}
  else show((error.message||'Request failed.')+(requested?' Check Rabby history. Automatic retry is blocked.':''));
  if(!requested)$('deploy').disabled=false;
 }finally{busy=false;}
};
(async()=>{try{
 payload=await(await fetch('/payload.json')).json();key='hashpaylink.arc.safe.'+payload.calldataHash;
 if(payload.chainId!==5042||payload.threshold!==2||payload.transaction.value!=='0'||ethers.keccak256(payload.transaction.data)!==payload.calldataHash)throw Error('Invalid creation plan.');
 if(payload.mode==='factory'){
  const constructor=payload.transaction.data.slice(-128),bytecode=payload.transaction.data.slice(0,-128);
  const args=ethers.AbiCoder.defaultAbiCoder().decode(['address','address'],'0x'+constructor);
  if(args[0]!==payload.token||args[1]!==payload.predictedSafe||ethers.keccak256(bytecode)!==payload.creationBytecodeHash||payload.transaction.to)throw Error('Factory constructor mismatch.');
 }else{
 const factory=new ethers.Interface(['function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address)']);
 const setup=new ethers.Interface(['function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)']);
 const decoded=factory.decodeFunctionData('createProxyWithNonce',payload.transaction.data);
 const config=setup.decodeFunctionData('setup',decoded.initializer);
 if(decoded.singleton.toLowerCase()!==payload.singleton.address.toLowerCase()||payload.transaction.to.toLowerCase()!==payload.proxyFactory.address.toLowerCase()||config.threshold!==2n||config.owners.length!==2||config.owners.some((a,i)=>a.toLowerCase()!==payload.owners[i].toLowerCase())||config.to!==ethers.ZeroAddress||config.data!=='0x'||config.fallbackHandler!==ethers.ZeroAddress||config.paymentToken!==ethers.ZeroAddress||config.payment!==0n||config.paymentReceiver!==ethers.ZeroAddress)throw Error('Safe owner/setup configuration mismatch.');
 }
 $('account').textContent=payload.deployer;$('owners').textContent=payload.owners.join('\n');$('safe').textContent=payload.predictedSafe;$('hash').textContent=payload.calldataHash;
 $('ceiling').textContent=ethers.formatEther(payload.maxGasCostWei)+' USDC';$('connect').disabled=false;if(!pending())show('Ready. Connect Rabby to review creation.');
}catch(error){show(error.message||'Could not load plan.');}})();
