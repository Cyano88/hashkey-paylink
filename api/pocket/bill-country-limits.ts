import {BILL_LIMITS_USD} from '../../src/lib/billLimits.js'
import {internationalOperator} from '../vtpass-international.js'
import type {createVtpassClient} from '../vtpass-client.js'

type Provider=ReturnType<typeof createVtpassClient>
type Service=Awaited<ReturnType<Provider['listAirtimeServices']>>[number]
export async function readBillCountryLimits(input:{country:'NG'|'UG';category:'airtime'|'data'|'tv'|'electricity';services:Service[];provider:Provider;ngnPerUsd:number;remainingUsd:number;now:number}) {
 const {country,category,provider,ngnPerUsd,remainingUsd}=input
 if(!Number.isFinite(ngnPerUsd)||ngnPerUsd<=0||!Number.isFinite(remainingUsd)||remainingUsd<0)throw Error('Current bill limits are unavailable.')
 const perPaymentUsd=category==='airtime'?BILL_LIMITS_USD.airtimePerPayment:null
 const budgetUsd=Math.min(perPaymentUsd??Infinity,remainingUsd)
 const floorMoney=(n:number)=>Math.floor(n*100+1e-8)/100
 const rows=await Promise.all(input.services.map(async service=>{
  if(country==='UG'){
   const plans=await provider.listUgandaVariations(internationalOperator(service.serviceId),category==='data'?'4':'1')
   if(category==='airtime'){
    // Match the same flexible product selected by the payment handler.
    const plan=plans.find(p=>!p.fixedPrice)
    if(!plan)return null
    const maximum=Math.min(plan.maximum,floorMoney(budgetUsd*ngnPerUsd/plan.rate))
    return {id:service.serviceId,name:service.name,minimum:plan.minimum,providerMaximum:plan.maximum,availableMaximum:maximum,available:maximum>=plan.minimum,planPriced:false}
   }
   const affordable=plans.filter(p=>p.fixedPrice&&p.amount>=p.minimum&&p.amount<=p.maximum&&p.chargedAmount<=floorMoney(budgetUsd*ngnPerUsd))
   const prices=plans.filter(p=>p.fixedPrice).map(p=>p.amount)
   if(!prices.length)return null
   return {id:service.serviceId,name:service.name,minimum:Math.min(...prices),providerMaximum:Math.max(...prices),availableMaximum:affordable.length?Math.max(...affordable.map(p=>p.amount)):0,available:affordable.length>0,planPriced:true}
  }
  const maximum=Math.min(service.maximumAmount??Infinity,floorMoney(budgetUsd*ngnPerUsd))
  return {id:service.serviceId,name:service.name,minimum:service.minimumAmount,providerMaximum:service.maximumAmount,availableMaximum:maximum,available:maximum>0&&maximum>=(service.minimumAmount??0),planPriced:category==='data'||category==='tv'}
 }))
 return {country,currency:country==='NG'?'NGN':'UGX',category,asOf:input.now,remainingUsd,perPaymentUsd,services:rows.filter(row=>row!==null)}
}
