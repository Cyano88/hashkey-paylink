import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import * as ethers from 'ethers'
const source=readFileSync(new URL('./arc-safe-local-signer.js',import.meta.url),'utf8')
const owners=['0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222']
const singleton={address:'0x3333333333333333333333333333333333333333',runtimeHash:ethers.keccak256('0x6000')}
const proxyFactory={address:'0x4444444444444444444444444444444444444444',runtimeHash:ethers.keccak256('0x6001')}
const predictedSafe='0x5555555555555555555555555555555555555555'
const setup=new ethers.Interface(['function setup(address[],uint256,address,bytes,address,address,uint256,address)'])
const factory=new ethers.Interface(['function createProxyWithNonce(address,bytes,uint256)'])
const initializer=setup.encodeFunctionData('setup',[owners,2,ethers.ZeroAddress,'0x',ethers.ZeroAddress,ethers.ZeroAddress,0,ethers.ZeroAddress])
const data=factory.encodeFunctionData('createProxyWithNonce',[singleton.address,initializer,1])
const base={chainId:5042,threshold:2,deployer:owners[0],owners,singleton,proxyFactory,predictedSafe,transaction:{to:proxyFactory.address,data,value:'0'},calldataHash:ethers.keccak256(data),maxGasCostWei:'150000000000000000'}
async function scenario(option={}){
 const elements={},storage=new Map();let sends=0
 const payload=structuredClone(base);if(option.changedOwner)payload.owners[1]=predictedSafe
 const provider={isRabby:true,on(){},async request({method,params}){
  if(method==='eth_accounts'||method==='eth_requestAccounts')return [option.wrongAccount?owners[1]:owners[0]]
  if(method==='wallet_switchEthereumChain')return null
  if(method==='eth_chainId')return option.wrongChain?'0xc4':'0x13b2'
  if(method==='eth_getCode')return params[0]===predictedSafe?(option.existing?'0x6000':'0x'):option.badCode?'0x6002':params[0]===singleton.address?'0x6000':'0x6001'
  if(method==='eth_call')return ethers.AbiCoder.defaultAbiCoder().encode(['address'],[option.badPrediction?owners[0]:predictedSafe])
  if(method==='eth_estimateGas')return '0x40000'
  if(method==='eth_gasPrice')return option.highGas?'0x100000000000':'0x1'
  if(method==='eth_getBalance')return option.noBalance?'0x0':'0x100000000000000000'
  if(method==='eth_sendTransaction'){
   sends++;assert.equal(params[0].from,owners[0]);assert.equal(params[0].to,proxyFactory.address);assert.equal(params[0].value,'0x0');assert.equal(params[0].data,data)
   if(option.reject)throw Object.assign(Error('Rejected'),{code:4001})
   if(option.timeout)throw Error('Timeout')
   return '0x'+'ab'.repeat(32)
  }
  throw Error(method)
 }}
 const context={ethers,Event,document:{getElementById:id=>elements[id]??=({disabled:true,textContent:''})},window:{ethereum:provider,addEventListener(){},dispatchEvent(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async()=>({ok:true,json:async()=>payload})}
 vm.runInNewContext(source,context);await new Promise(r=>setTimeout(r,0))
 if(!elements.connect.disabled)await elements.connect.onclick()
 if(!elements.deploy.disabled)await elements.deploy.onclick()
 return {elements,storage,get sends(){return sends}}
}
for(const flag of ['wrongAccount','wrongChain','badCode','existing','badPrediction','highGas','noBalance','changedOwner'])assert.equal((await scenario({[flag]:true})).sends,0,flag)
const rejected=await scenario({reject:true});assert.equal(rejected.storage.size,0)
const uncertain=await scenario({timeout:true});assert.equal(uncertain.storage.size,1);await uncertain.elements.deploy.onclick();assert.equal(uncertain.sends,1)
const success=await scenario();await success.elements.deploy.onclick();assert.equal(success.sends,1);assert.match(success.elements.result.textContent,/0xabab/)
console.log('Local Safe signing UI passed: account/chain, owners, dependency hashes, existing deployment, prediction, fee/balance, rejection, uncertain response and duplicate guards. Wallet calls mocked; no broadcast.')
