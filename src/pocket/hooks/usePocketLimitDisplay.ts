import {createElement,useEffect} from 'react'
import {MoneyAmount} from '../../components/MoneyText'
import PocketAmountShimmer from '../components/PocketAmountShimmer'
import usePocketFxQuote from './usePocketFxQuote'
export default function usePocketLimitDisplay(_localCurrency?: 'NGN' | 'UGX') {
 const ngn=usePocketFxQuote(1,true,'NGN',true)
 const currency='USD'
 useEffect(()=>{const timer=setInterval(()=>{void ngn.refresh()},30000);return()=>clearInterval(timer)},[ngn.refresh])
 const fromUsd=(value:number)=>createElement(MoneyAmount,{currency,amount:value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})})
 // Only legacy NGN error payloads need conversion. Policy amounts remain USD.
 const usdc=(value:number)=>ngn.quote?fromUsd(value/ngn.quote.rate):ngn.loading?createElement(PocketAmountShimmer,{label:'Loading allowance'}):'Rate unavailable'
 return {currency,usdc,fromUsd,secondary:(_value:number)=>null}
}
