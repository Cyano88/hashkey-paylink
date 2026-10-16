import assert from 'node:assert/strict'
import {decodeFunctionData,parseAbi} from 'viem'
import {createXLayerFeeEstimator,configuredXLayerReimbursement} from '../api/pocket/xlayer-fee-estimator.ts'
const now=1700000000000,native='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',token='0xb6ceceab302e2e4948951ee7843fc24e92933061'
const wallet='0x1111111111111111111111111111111111111111'
const policy={providerBps:1000,providerFixedUsdMicros:1000n,maxFeeUnits:1000000n,pricing:{marginBps:2500,minimumFeeUnits:'0'}} // Synthetic terms, NOT production settings.
function fixture(){
 const state={chain:'0xc4',l1:'0x0',clock:now,priceAge:0,blockAge:0,gasPrice:'0x1312d00',stable:1,code:'0xef0100d6cedde84be40893d153be9d467cd6ad37875b28'}
 const methods=[]
 const rpc=async(method,params)=>{methods.push(method);switch(method){
  case 'eth_chainId':return state.chain
  case 'eth_getCode':return state.code
  case 'eth_call':if(params[0].to.toLowerCase()==='0x420000000000000000000000000000000000000f'){const decoded=decodeFunctionData({abi:parseAbi(['function getL1FeeUpperBound(uint256) view returns(uint256)']),data:params[0].data});assert.ok(decoded.args[0]>1024n);return state.l1}return '0x0'
  case 'eth_estimateUserOperationGas':return {callGasLimit:'0xc350',verificationGasLimit:'0x7530',preVerificationGas:'0x4e20'}
  case 'rundler_getUserOperationGasPrice':return {blockNumber:'0x1',suggested:{maxFeePerGas:state.gasPrice}}
  case 'eth_gasPrice':return state.gasPrice
  case 'eth_getBlockByNumber':return {number:'0x1',hash:'0x'+'a'.repeat(64),timestamp:'0x'+Math.floor((now-state.blockAge)/1000).toString(16)}
  default:throw Error('Unexpected RPC '+method)
 }}
 const prices=async()=>({[native]:{usd:100,fetchedAt:now-state.priceAge},[token]:{usd:state.stable,fetchedAt:now-state.priceAge}})
 return {state,methods,rpc,prices,now:()=>state.clock}
}
const input={ownerId:'owner',walletId:'wallet',walletAddress:wallet,asset:'USDC',amountUnits:'1000000',intentId:'intent',calls:[{to:token,data:'0x1234',value:'0x0'}]}
let f=fixture(),estimate=createXLayerFeeEstimator({...f,policy})
const q=await estimate(input);assert.equal(q.feeUnits,'1275');assert.equal(q.expiresAt,now+30000)
f.state.l1='0xe8d4a51000' // 1e12 wei = 100 USD micros at $100/OKB
assert.equal((await estimate(input)).feeUnits,'1385')
f.state.stable=0.5;assert.equal((await estimate(input)).feeUnits,'2770','stablecoin conversion must not assume a dollar peg')
assert.ok(f.methods.every(m=>!m.includes('send')&&!m.includes('sign')&&!m.includes('Balance')))
for(const edit of [s=>s.chain='0x7a0',s=>s.priceAge=30000,s=>s.blockAge=31000,s=>s.stable=0,s=>s.stable=NaN,s=>s.code='0x',s=>s.gasPrice='bad',s=>s.clock=now+31000]){
 f=fixture();edit(f.state);await assert.rejects(()=>createXLayerFeeEstimator({...f,policy})(input))
}
f=fixture();await assert.rejects(()=>createXLayerFeeEstimator({...f,policy:{...policy,maxFeeUnits:100n}})(input))
assert.throws(()=>createXLayerFeeEstimator({...f,policy:{...policy,providerBps:NaN}}))
const env={POCKET_XLAYER_REIMBURSEMENT_ENABLED:'true',PRIVATE_RPC_URL_XLAYER:'https://rpc.example.invalid',POCKET_XLAYER_PROVIDER_FEE_BPS:'1000',POCKET_XLAYER_PROVIDER_FIXED_USD_MICROS:'1000',POCKET_XLAYER_FEE_MARGIN_BPS:'2500',POCKET_XLAYER_MIN_FEE_UNITS:'0',POCKET_XLAYER_MAX_FEE_UNITS:'1000000'}
assert.ok(configuredXLayerReimbursement(env))
for(const key of Object.keys(env))assert.equal(configuredXLayerReimbursement({...env,[key]:''}),undefined)
assert.equal(configuredXLayerReimbursement({...env,POCKET_XLAYER_FEE_MARGIN_BPS:'0'}),undefined)
assert.equal(configuredXLayerReimbursement({...env,PRIVATE_RPC_URL_XLAYER:'http://unsafe.invalid'}),undefined)
console.log('PASS complete-cost arithmetic, L1 bound, 7702 allowance, provider fees, depeg conversion, fresh prices/blocks, ceiling and missing-config rejection. Synthetic billing terms only; no transactions.')
