import { getAddress, isAddress, keccak256, parseUnits, stringToHex, type Address } from 'viem';
import { configuredXLayerAssets } from './registry.js';
import { prepareTradeXLayerAction } from './planner.js';
import { tradeXLayerAssets } from './assets.js';
import { TRADE_XLAYER_FACTORY, TRADE_XLAYER_ARBITER, type TradeXLayerAction } from '../../src/lib/xstocksAgreement/protocol.js';
import { type WorkPayment } from '../../src/lib/xstocksAgreement/workXLayer.js';
import { xStockMetadata } from '../../src/lib/xstocksAgreement/xStocksAssets.js';
export function workXLayerEnabled(env:NodeJS.ProcessEnv){return env.HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED==='true';}
function fail(message:string):never{throw Object.assign(Error(message),{status:400});}
export function parseWorkPayment(body:Record<string,unknown>,amount:string,duration:number,env:NodeJS.ProcessEnv,prior?:WorkPayment):WorkPayment|undefined{
  if(body.paymentRail!==undefined&&!['arc','xlayer'].includes(String(body.paymentRail)))fail('Choose a supported payment network.');
  if(prior&&body.paymentRail==='arc')fail('Create a new request to change the payment network.');
  if(body.paymentRail!=='xlayer'&&!prior)return undefined;
  if(!workXLayerEnabled(env))fail('X Layer work payments are not available yet.');
  if(body.template!==undefined&&body.template!=='fixed_unlock')fail('Stock work payments currently support one release.');
  const token=String(body.paymentToken??prior?.token??'');
  if(!isAddress(token)||/^0x0{40}$/i.test(token))fail('Select a payment asset.');
  const configured=configuredXLayerAssets(env).get(token.toLowerCase());
  const decimals=configured&&xStockMetadata(token)?configured.decimals:undefined;
  if(decimals===undefined)fail('This stock is not approved for work payments.');
  if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)||(amount.split('.')[1]?.length||0)>decimals)fail('Enter an exact quantity within the token precision.');
  const amountUnits=parseUnits(amount,decimals);if(amountUnits<=0n||amountUnits>=2n**256n)fail('Enter a valid positive token amount.');
  if(!Number.isInteger(duration)||duration<86400||duration>30*86400)fail('Choose a work submission deadline between 1 and 30 days.');
  const reviewHours=Number(body.reviewHours??prior?.reviewHours??48);if(![24,48,72].includes(reviewHours))fail('Choose a 24, 48 or 72 hour review period.');
  return {policy:'work-xlayer-v1',chainId:196,token:getAddress(token),decimals,amountUnits:amountUnits.toString(),reviewHours:reviewHours as 24|48|72,responseDays:7};
}
export type WorkTermsForBinding={kind?:'trade';trade?:import('./trade.js').TradeDetails;version:number;title:string;description:string;amount:string;durationSeconds:number;xlayerPayment?:WorkPayment};
export function prepareWorkBinding(id:string,terms:WorkTermsForBinding,buyer:string,seller:string,now:number){
  const p=terms.xlayerPayment;if(!p||p.policy!=='work-xlayer-v1'||p.chainId!==196)throw Error('Work payment terms are unavailable.');
  const roles=[buyer,seller,TRADE_XLAYER_ARBITER,TRADE_XLAYER_FACTORY,p.token].map(value=>getAddress(value));
  if(new Set(roles.map(a=>a.toLowerCase())).size!==5||roles.some(a=>/^0x0{40}$/i.test(a)))throw Error('Work participants must use distinct wallets.');
  const fundBy=now+86400;
  const core={policy:p.policy,requestId:id,version:terms.version,title:terms.title,description:terms.description,amount:p.amountUnits,decimals:p.decimals,token:getAddress(p.token),buyer:roles[0],seller:roles[1],arbiter:TRADE_XLAYER_ARBITER,factory:TRADE_XLAYER_FACTORY,chainId:196,fundBy,dispatchWindow:terms.durationSeconds,deliveryWindow:p.responseDays*86400,inspectionWindow:p.reviewHours*3600};
  const termsHash=keccak256(stringToHex(JSON.stringify(core)));
  return {chainId:196,factory:TRADE_XLAYER_FACTORY,termsHash,contractTerms:{offerId:keccak256(stringToHex('hashpaystream:work:'+id+':'+terms.version)),termsHash,buyer:roles[0],seller:roles[1],arbiter:TRADE_XLAYER_ARBITER,token:getAddress(p.token),amount:p.amountUnits,decimals:p.decimals,fundBy,dispatchWindow:core.dispatchWindow,deliveryWindow:core.deliveryWindow,inspectionWindow:core.inspectionWindow}};
}
export type WorkEscrowRecord={wallets:Partial<Record<'customer'|'provider',string>>;binding?:ReturnType<typeof prepareWorkBinding>;state?:number;observedBlock?:string;escrow?:string;observedAt?:string;evidence?:Array<{hash:string;body:string;actor:'customer'|'provider';createdAt:string}>};
export async function workPaymentAssets(env:NodeJS.ProcessEnv){return tradeXLayerAssets({...env,HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:workXLayerEnabled(env)?'true':'false'});}
export async function prepareWorkAction(input:{env:NodeJS.ProcessEnv;binding:ReturnType<typeof prepareWorkBinding>;account:Address;action?:TradeXLayerAction;evidence?:unknown}, planner=prepareTradeXLayerAction){
  // Pausing new work payments must preserve existing refund/release/dispute access.
  const starts=['create','accept','approve','fund'];
  if(!workXLayerEnabled(input.env)&&input.action&&starts.includes(input.action))throw Error('New work payments are paused.');
  const t=input.binding.contractTerms;
  let permitted=false;
  try {const registered=xStockMetadata(t.token)?configuredXLayerAssets(input.env).get(t.token.toLowerCase()):undefined;permitted=!!registered&&registered.decimals===t.decimals;} catch { /* Invalid new-asset configuration must not strand existing escrow. */ }
  if(input.action&&starts.includes(input.action)&&!permitted)throw Error('This asset is no longer approved for new work payments.');
  const result=await planner({...input,env:{...input.env,HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:'true'}});
  if(!workXLayerEnabled(input.env)||!permitted)result.actions=result.actions.filter(action=>!starts.includes(action));
  return result;
}
