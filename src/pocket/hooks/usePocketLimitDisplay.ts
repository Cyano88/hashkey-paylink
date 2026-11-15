import {createElement,useEffect} from 'react'
import {MoneyAmount} from '../../components/MoneyText'
import PocketAmountShimmer from '../components/PocketAmountShimmer'
import usePocketFxQuote from './usePocketFxQuote'
import usePocketDisplayCurrency from './usePocketDisplayCurrency'
export default function usePocketLimitDisplay(_localCurrency?: 'NGN' | 'UGX') {
 const preference=usePocketDisplayCurrency(),currency=preference==='USDC'?'USD':preference
 const ngn=usePocketFxQuote(1,true,'NGN',true),ugx=usePocketFxQuote(1,currency==='UGX','UGX',true)
 useEffect(()=>{const timer=setInterval(()=>{void ngn.refresh();if(currency==='UGX')void ugx.refresh()},30000);return()=>clearInterval(timer)},[currency,ngn.refresh,ugx.refresh])
 const show=(value:number,source:'NGN'|'USD')=>{
  let converted:number|null=value,loading=false
  if(source!==currency){
   const usd=source==='USD'?value:ngn.quote?value/ngn.quote.rate:null
   converted=currency==='USD'?usd:currency==='NGN'?usd!==null&&ngn.quote?usd*ngn.quote.rate:null:usd!==null&&ugx.quote?usd*ugx.quote.rate:null
   loading=(source==='NGN'||currency==='NGN')&&ngn.loading||currency==='UGX'&&ugx.loading
  }
  if(converted===null)return loading?createElement(PocketAmountShimmer,{label:'Loading allowance'}):'Rate unavailable'
  return createElement(MoneyAmount,{currency,amount:converted.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})})
 }
 return {currency,usdc:(value:number)=>show(value,'NGN'),fromUsd:(value:number)=>show(value,'USD'),secondary:(_value:number)=>null}
}
