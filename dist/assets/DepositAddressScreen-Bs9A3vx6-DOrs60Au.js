import{b3 as se,I as k,r as p,g as ie,j as r,aM as q,a as d,A as ae,k as le,b4 as de}from"./index-CM9ijliE.js";import{n as v}from"./ScreenLayout-Dmp7r6fS-CoshmkXI.js";import{n as X}from"./styles-DVyDvTdj-D566R4gQ.js";import{a as H,C as ce}from"./poll-CGBuN8pf-Dqx4YBW7.js";import{m as ue}from"./ModalHeader-rFKqcgRs-CWKlOXpb.js";import{C as me}from"./QrCode-cBrqXGmp-CJ9XBWRp.js";import{u as pe,e as he,g as fe,h as ge,c as ye,j as be,k as ve,l as xe,m as Ce,F as we,d as ke,o as Ee,f as _e,s as je}from"./floating-ui.react-C9rAi2ck.js";import{m as Te}from"./CopyableText-D2t3Xzed-BnbimrJt.js";import"./browser-Bxlwbvq2.js";import{T as F}from"./triangle-alert-bHFx5BtZ.js";import{c as j}from"./createLucideIcon-CuJ-N9EZ.js";import{C as $}from"./check-DVsI_78E.js";import{H as Se}from"./hourglass-ClbRwqFp.js";import"./Screen-DXLhhfU3-CVnQ0xZF.js";import"./index-Dq_xe9dz-BAMCfLyH.js";import"./copy-D-h26-y-.js";const Ne={path:"/api/v1/onramp/deposit_addresses/quote",method:"POST"},Y={path:"/api/v1/onramp/deposit_addresses/orders/:order_id",method:"GET"},Ue={path:"/api/v1/onramp/deposit_addresses/:deposit_address_id/next_order",method:"GET"},Ie={path:"/api/v1/onramp/deposit_addresses/deposit_config",method:"GET"},w=se(()=>null),_=e=>{w.getState()!==null&&w.setState(e)};async function Oe(e){let t=await e.fetchPrivyRoute(Ie,{});_({config:{status:"ready",data:{currencies:t.currencies,chains:t.chains}}})}function f(){let e=w(),{closePrivyModal:t,privy:o}=k(),n=(e==null?void 0:e.params)??null,i=(e==null?void 0:e.config)??{status:"loading"},a=p.useCallback(s=>{_({modalState:s})},[]),l=p.useCallback(async()=>{if(n){_({config:{status:"loading"}});try{await Oe(o)}catch(s){throw _({config:{status:"error",error:s instanceof Error?s:Error("Failed to load deposit config")}}),s}}},[n,o]),u=p.useCallback(()=>{if(!e)return;let{modalState:s}=e;s.step==="complete"?e.onComplete():s.step==="failed"?e.onError(Error("DEPOSIT_FAILED")):s.step==="error"?e.onError(Error(s.code)):s.step==="refunded"?e.onError(Error("DEPOSIT_REFUNDED")):e.onError(Error("USER_EXITED")),t({shouldCallAuthOnSuccess:!1})},[e,t]);return{modalState:(e==null?void 0:e.modalState)??{step:"intro"},setModalState:a,config:i,retryConfig:l,params:n,close:u}}function x(e){let{modalState:t,config:o,params:n,...i}=f();if(function(a,l){if(a.step!==l)throw Error("UNEXPECTED_STATE")}(t,e),!n||o.status!=="ready")throw Error("UNEXPECTED_STATE");return{state:t,configData:o.data,params:n,...i}}/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Re=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],De=j("chevron-up",Re);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ae=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],Fe=j("info",Ae);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $e=[["rect",{width:"5",height:"5",x:"3",y:"3",rx:"1",key:"1tu5fj"}],["rect",{width:"5",height:"5",x:"16",y:"3",rx:"1",key:"1v8r4q"}],["rect",{width:"5",height:"5",x:"3",y:"16",rx:"1",key:"1x03jg"}],["path",{d:"M21 16h-3a2 2 0 0 0-2 2v3",key:"177gqh"}],["path",{d:"M21 21v.01",key:"ents32"}],["path",{d:"M12 7v3a2 2 0 0 1-2 2H7",key:"8crl2c"}],["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M12 3h.01",key:"n36tog"}],["path",{d:"M12 16v.01",key:"133mhm"}],["path",{d:"M16 12h1",key:"1slzba"}],["path",{d:"M21 12v.01",key:"1lwtk9"}],["path",{d:"M12 21v-1",key:"1880an"}]],Q=j("qr-code",$e);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=[["path",{d:"M9 14 4 9l5-5",key:"102s5s"}],["path",{d:"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",key:"f3b9sd"}]],Me=j("undo-2",Pe);class Le extends p.Component{static getDerivedStateFromError(){return{hasError:!0}}componentDidCatch(t,o){this.props.onError(t)}componentDidUpdate(t){t.resetKey!==this.props.resetKey&&this.state.hasError&&this.setState({hasError:!1})}render(){return this.state.hasError?null:this.props.children}constructor(...t){super(...t),this.state={hasError:!1}}}function P(e){return e.startsWith("eip155:")?"ethereum":e.startsWith("solana:")?"solana":e.startsWith("bip122:")?"bitcoin-segwit":e.startsWith("tron:")?"tron":void 0}function ze(e,t,o){let n=Number(e);return!Number.isFinite(n)||n===0?`1 ${t} ≈ ${e} ${o}`:n>=.01?`1 ${t} ≈ ${M(n)} ${o}`:`${M(1/n)} ${t} ≈ 1 ${o}`}function M(e){return e>=1e3?new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Math.round(e)):e>=100?new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(e):e>=1?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(e):new Intl.NumberFormat("en-US",{maximumFractionDigits:4}).format(e)}function L(e,t){let o=Number(e);if(!Number.isFinite(o)||o===0)return e;let n=t!=null?o/10**t:o;return n>=1e3?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n):n>=1?new Intl.NumberFormat("en-US",{maximumFractionDigits:4}).format(n):n>=1e-4?new Intl.NumberFormat("en-US",{maximumFractionDigits:6}).format(n):new Intl.NumberFormat("en-US",{maximumSignificantDigits:4}).format(n)}function A({address:e,caip2:t,config:o}){let n=Object.values(o.chains).find(i=>i.caip2===t);if(!n)return{symbol:e,decimals:void 0};for(let i of o.currencies){let a=i.chains.find(l=>l.chainId===n.chainId&&l.address.toLowerCase()===e.toLowerCase());if(a)return{symbol:i.symbol.toUpperCase(),decimals:a.decimals}}return{symbol:e,decimals:void 0}}function z(e,t){for(let o of Object.values(t))if(o.caip2===e)return o.displayName;return e}function V(e,t){let o=Object.values(e.chains).find(i=>i.caip2===t.destinationChain);if(!o)return`Unsupported destination chain: "${t.destinationChain}". Check that the chain is in CAIP-2 format (e.g. "eip155:8453") and is supported for deposit addresses.`;let n=t.destinationCurrency.toLowerCase();return e.currencies.some(i=>i.chains.some(a=>a.chainId===o.chainId&&a.address.toLowerCase()===n))?null:`Unsupported destination currency "${t.destinationCurrency}" on chain "${t.destinationChain}". Check that this token address is supported on the specified chain.`}let Ve=new Set(["ROUTE_UNAVAILABLE","UNEXPECTED_STATE","TIMEOUT_WAITING_FOR_NEXT_ORDER","TIMEOUT_ORDER_COMPLETION","DEPOSIT_FAILED","DEPOSIT_REFUNDED","USER_EXITED","AMOUNT_TOO_LOW","INSUFFICIENT_LIQUIDITY","UNSUPPORTED_CHAIN","UNSUPPORTED_CURRENCY","UNSUPPORTED_ROUTE","NO_SWAP_ROUTES_FOUND","NO_INTERNAL_SWAP_ROUTES_FOUND","NO_QUOTES","SANCTIONED_WALLET_ADDRESS","REFUND_WALLET_CREATION_FAILED"]);function We(e){return Ve.has(e)}function Be(e){return We(e)?e:"UNKNOWN_ERROR"}function qe(){let{privy:e,refreshSessionAndUser:t}=k(),{user:o}=le();return p.useCallback(async(n,i)=>{if(i)return{ok:!0,address:i};let a=function(u,s){let c=P(u);if(!c)return;let m=s.find(h=>h.type==="wallet"&&h.chainType===c&&h.address);return m==null?void 0:m.address}(n,(o==null?void 0:o.linkedAccounts)??[]);if(a)return{ok:!0,address:a};let l=P(n);if(!l)return{ok:!1,error:"UNSUPPORTED_CHAIN"};try{let u=await e.fetchPrivyRoute(de,{body:{chain_type:l}});return await t(),{ok:!0,address:u.address}}catch{return{ok:!1,error:"REFUND_WALLET_CREATION_FAILED"}}},[e,t,o])}function G(){let{params:e,setModalState:t}=f(),{privy:o}=k(),n=qe(),[i,a]=p.useState(!1);return{fetchQuote:p.useCallback(async(l,u,s)=>{if(e){a(!0);try{let c=await n(l.caip2,e.refundAddress);if(!c.ok)return void t({step:"error",code:c.error});let m=await o.fetchPrivyRoute(Ne,{body:{source_chain:l.caip2,source_currency:l.currencyAddress,destination_chain:e.destinationChain,destination_currency:e.destinationCurrency,destination_address:e.destinationAddress,refund_address:c.address,...e.slippageBps!=null?{slippage_bps:e.slippageBps}:{}}});t({step:"address",selectedCurrency:u,selectedChain:l,availableChains:s,quote:m})}catch(c){let m=c instanceof Error?c:Error(String(c)),h="status"in m&&typeof m.status=="number"?m.status:void 0;t({step:"error",code:h&&h>=500?"UNKNOWN_ERROR":Be(m.message),message:m.message})}finally{a(!1)}}},[e,o,n,t]),isFetching:i}}let K=Math.ceil(360);function J(e,t){switch(e.status){case"completed":return t({step:"complete",order:e});case"refunded":return t({step:"refunded",order:e});case"failed":return t({step:"failed",order:e});case"executing":return t({step:"processing",order:e});default:return e.status,t({step:"processing",order:e})}}function Xe({depositAddressId:e,enabled:t,quoteCreatedAt:o}){let{privy:n}=k(),{setModalState:i}=f();p.useEffect(()=>{if(!e)return;let a=new AbortController;return H({operation:async()=>(await n.fetchPrivyRoute(Ue,{params:{deposit_address_id:e},query:{after:o}})).order??void 0,until:l=>l!==void 0,delay:5e3,interval:5e3,attempts:K,signal:a.signal}).then(async l=>{if(!a.signal.aborted)if(l.status==="success"&&l.result){let u=l.result,s=await n.fetchPrivyRoute(Y,{params:{order_id:u.id}});a.signal.aborted||J(s,i)}else l.status==="max_attempts"&&i({step:"error",code:"TIMEOUT_WAITING_FOR_NEXT_ORDER"})}),()=>{a.abort()}},[t,e,n,o,i])}function He({orderId:e,enabled:t}){let{privy:o}=k(),{setModalState:n}=f();p.useEffect(()=>{let i=new AbortController;return H({operation:async()=>await o.fetchPrivyRoute(Y,{params:{order_id:e}}),until:a=>a.status!=="executing",delay:5e3,interval:5e3,attempts:K,signal:i.signal}).then(a=>{i.signal.aborted||(a.status==="success"?J(a.result,n):a.status==="max_attempts"&&n({step:"error",code:"TIMEOUT_ORDER_COMPLETION"}))}),()=>{i.abort()}},[t,e,o,n])}const T=d(v)`
  #privy-content-footer-container {
    margin-top: 0;
  }
`,Ye=d.p`
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.375rem;
  color: var(--privy-color-foreground-3);
  margin: 0.25rem 0 0;
`,Z=d.img`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-full);
  object-fit: cover;
  flex-shrink: 0;
`,ee=d.img`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-sm);
  object-fit: cover;
  flex-shrink: 0;
`,re=d.span`
  font-weight: 500;
`,Qe=d.span`
  font-size: 0.875rem;
  color: var(--privy-color-foreground-3);
  margin-left: auto;
`;d.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  min-height: 2.25rem;
  border-radius: 6.25rem;
  border: none;
  background-color: var(--privy-color-background-2);

  input {
    flex: 1;
    border: none;
    outline: none;
    box-shadow: none;
    font-size: 0.875rem;
    line-height: 1.25rem;
    background: transparent;
    color: var(--privy-color-foreground);

    &:focus {
      outline: none;
      box-shadow: none;
    }

    &::placeholder {
      color: var(--privy-color-foreground-3);
    }
  }
`;const te=d.button`
  && {
    position: relative;
    width: 100%;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.625rem 0.75rem;
    min-height: 3.5rem;
    border: 1px solid
      ${e=>e.$selected?"var(--privy-color-icon-interactive)":"var(--privy-color-foreground-4)"};
    border-radius: var(--privy-border-radius-md);
    background-color: ${e=>e.$selected?"var(--privy-color-info-bg)":"transparent"};
    color: var(--privy-color-foreground);
    font-size: 0.875rem;
    line-height: 1.5rem;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    transition:
      background-color 200ms ease,
      border-color 200ms ease;

    &:hover {
      background-color: var(--privy-color-background-2);
    }

    &:disabled {
      opacity: ${e=>e.$selected?1:.5};
      cursor: not-allowed;
    }

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`,W=d.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem 0;
`,Ge=d.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.5rem 0;
`,N=d.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`,U=d.div`
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--privy-border-radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: ${e=>e.$status==="done"?"var(--privy-color-success-light, #DCFCE7)":"var(--privy-color-background-2)"};
`,B=d.div`
  width: 2px;
  height: 1rem;
  background-color: var(--privy-color-background-2);
  margin-left: 0.6875rem;
`,I=d.span`
  font-size: 0.875rem;
  color: var(--privy-color-foreground);
`;d.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: var(--privy-border-radius-md);
  background-color: var(--privy-color-background-2);
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;const O=d.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8125rem;
  line-height: 1.25rem;
`,R=d.span`
  color: var(--privy-color-foreground);
  font-weight: 400;
`,D=d.span`
  color: var(--privy-color-foreground);
  font-weight: 500;
  text-align: right;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`,oe=d(q)`
  && {
    margin-left: auto;
    height: 1.5rem;
    width: 1.5rem;
    border-width: 2px;
    flex-shrink: 0;
  }
`,Ke=({sourceAmount:e,sourceSymbol:t,sourceChainName:o,sourceDecimals:n,destinationAmount:i,destSymbol:a,destChainName:l,destDecimals:u,onClose:s})=>r.jsx(T,{icon:$,iconVariant:"success",title:"Transfer complete",subtitle:i?`Received ${L(e,n)} ${t} on ${o} and converted it to ${L(i,u)} ${a} on ${l}. Funds are available to use.`:`Your ${t} has been received and is now available in your wallet.`,showClose:!0,onClose:s,primaryCta:{label:"Done",onClick:s},watermark:!1});function Je(){let{state:e,configData:t,close:o}=x("complete"),{order:n}=e,{sourceSymbol:i,sourceChainName:a,sourceDecimals:l,destSymbol:u,destChainName:s,destDecimals:c}=p.useMemo(()=>{let m=A({address:n.source_currency,caip2:n.source_chain,config:t}),h=A({address:n.destination_currency,caip2:n.destination_chain,config:t});return{sourceSymbol:m.symbol,sourceChainName:z(n.source_chain,t.chains),sourceDecimals:m.decimals,destSymbol:h.symbol,destChainName:z(n.destination_chain,t.chains),destDecimals:h.decimals}},[n,t]);return r.jsx(Ke,{sourceAmount:n.source_amount,sourceSymbol:i,sourceChainName:a,sourceDecimals:l,destinationAmount:n.destination_amount,destSymbol:u,destChainName:s,destDecimals:c,onClose:o})}function Ze(){let{modalState:e,setModalState:t,config:o,retryConfig:n,close:i}=f();if(e.step!=="error")throw Error("UNEXPECTED_STATE");let{code:a}=e,{title:l,subtitle:u,detail:s,iconVariant:c}=(y=>{switch(y){case"AMOUNT_TOO_LOW":return{title:"Amount too low",subtitle:"The deposit amount is below the minimum for this route.",detail:"Try a larger amount or a different token.",iconVariant:"warning"};case"INSUFFICIENT_LIQUIDITY":return{title:"Insufficient liquidity",subtitle:"There isn't enough liquidity for this route right now.",detail:"Try a smaller amount or a different network.",iconVariant:"warning"};case"UNSUPPORTED_CHAIN":return{title:"Unsupported chain",subtitle:"Deposits from this chain type aren't supported yet. Try a different network.",iconVariant:"warning"};case"UNSUPPORTED_CURRENCY":case"UNSUPPORTED_ROUTE":case"ROUTE_UNAVAILABLE":case"NO_SWAP_ROUTES_FOUND":case"NO_INTERNAL_SWAP_ROUTES_FOUND":case"NO_QUOTES":return{title:"Route not available",subtitle:"This deposit route isn't supported right now. Try a different token or network.",iconVariant:"warning"};case"SANCTIONED_WALLET_ADDRESS":return{title:"Address restricted",subtitle:"This address cannot be used for deposits due to compliance restrictions.",iconVariant:"warning"};case"REFUND_WALLET_CREATION_FAILED":return{title:"Unable to set up refund address",subtitle:"We couldn't create a wallet to receive refunds on this chain. Please try again or select a different network.",iconVariant:"warning"};case"TIMEOUT_WAITING_FOR_NEXT_ORDER":case"TIMEOUT_ORDER_COMPLETION":return{title:"Taking longer than expected",subtitle:"Your funds are safe. The deposit is still being processed — check back later.",iconVariant:"subtle"};default:return{title:"Something went wrong",subtitle:"We couldn't complete your request. Please try again.",iconVariant:"subtle"}}})(a),[m,h]=p.useState(!1);return r.jsx(T,{icon:F,iconVariant:c,title:l,subtitle:s?`${u} ${s}`:u,showClose:!0,onClose:i,primaryCta:{label:"Try again",onClick:async()=>{if(o.status!=="ready"){h(!0);try{await n(),t({step:"token"})}catch{h(!1)}}else t({step:"token"})},loading:m},watermark:!0})}function er(){let{state:e,close:t}=x("failed"),{order:o}=e;return r.jsx(v,{icon:F,iconVariant:"error",title:"Transfer failed",subtitle:"Something went wrong processing your transfer.",showClose:!0,onClose:t,primaryCta:{label:"Done",onClick:t},secondaryCta:{label:"Learn about manual recovery",onClick:()=>window.open("https://docs.privy.io","_blank","noopener,noreferrer")},watermark:!0,children:r.jsxs(rr,{href:o.tracking_url,target:"_blank",rel:"noopener noreferrer",children:["Reference: ",o.provider_request_id]})})}let rr=d.a`
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.7;
  text-decoration: underline;
  cursor: pointer;
  color: var(--privy-color-foreground-3);
`;function tr(){let{close:e,setModalState:t,config:o,params:n}=f(),[i,a]=p.useState(!1);return p.useEffect(()=>{if(i&&n){if(o.status==="ready"){let l=V(o.data,n);t(l?{step:"error",code:"ROUTE_UNAVAILABLE",message:l}:{step:"token"})}o.status==="error"&&t({step:"error",code:"ROUTE_UNAVAILABLE"})}},[i,o,n,t]),r.jsx(T,{icon:Q,iconVariant:"subtle",title:"Add funds",subtitle:"Top up your account by sending crypto from any wallet. Conversion and routing handled by Relay.",showClose:!0,onClose:e,primaryCta:{label:"Continue",onClick:()=>{if(o.status==="ready"&&n){let l=V(o.data,n);t(l?{step:"error",code:"ROUTE_UNAVAILABLE",message:l}:{step:"token"})}else o.status==="error"?t({step:"error",code:"ROUTE_UNAVAILABLE"}):a(!0)},loading:i&&o.status==="loading",loadingText:null},watermark:!0})}function or(){let{state:e,setModalState:t,close:o}=x("network"),[n,i]=p.useState(-1),{availableChains:a}=e,{confirm:l,isFetching:u}=function(){let s=w(),{params:c}=f(),{fetchQuote:m,isFetching:h}=G();return{confirm:p.useCallback(async y=>{if(!y||!c)return;let g=s==null?void 0:s.modalState;g&&g.step==="network"&&await m(y,g.selectedCurrency,g.availableChains)},[c,s,m]),isFetching:h}}();return r.jsx(v,{title:"Select network",eyebrow:r.jsxs("span",{style:{display:"flex",alignItems:"center",gap:"0.375rem"},children:[r.jsx("img",{src:e.selectedCurrency.logoURI,alt:"",style:{width:"1rem",height:"1rem",borderRadius:"50%"}}),"Send ",e.selectedCurrency.symbol]}),showBack:!0,onBack:()=>t({step:"token"}),showClose:!0,onClose:o,watermark:!0,children:r.jsx(X,{style:{marginTop:"1rem",height:"22rem"},$colorScheme:"light",children:a.map((s,c)=>r.jsxs(te,{$selected:n===c,disabled:u,onClick:()=>{i(c),l(s)},children:[r.jsx(ee,{src:s.iconUrl,alt:s.displayName}),r.jsx(re,{children:s.displayName}),u&&c===n&&r.jsx(oe,{})]},s.chainId))})})}const nr=({trackingUrl:e,onClose:t})=>r.jsx(v,{icon:Se,iconVariant:"subtle",title:"Transfer in progress",subtitle:"Your deposit was received and the transfer is now processing.",showClose:!0,onClose:t,secondaryCta:{label:"View on block explorer ↗",onClick:()=>window.open(e,"_blank","noopener,noreferrer")},watermark:!1,children:r.jsxs(Ge,{children:[r.jsxs(N,{children:[r.jsx(U,{$status:"done",children:r.jsx($,{size:14,color:"var(--privy-color-icon-success)",strokeWidth:2})}),r.jsx(I,{children:"Deposit received"})]}),r.jsx(B,{}),r.jsxs(N,{children:[r.jsx(U,{$status:"active",children:r.jsx(sr,{})}),r.jsx(I,{children:"Bridging"})]}),r.jsx(B,{}),r.jsxs(N,{children:[r.jsx(U,{$status:"pending"}),r.jsx(I,{children:"Funds arrived"})]})]})});let sr=d.span`
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--privy-color-foreground-3);
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;function ir(){let{state:e,close:t}=x("processing");return He({orderId:e.order.id,enabled:!0}),r.jsx(nr,{trackingUrl:e.order.tracking_url,onClose:t})}function ar(){let{state:e,close:t}=x("refunded"),{order:o}=e;return r.jsx(T,{icon:Me,iconVariant:"subtle",title:"Transfer refunded",subtitle:"Your transfer was received, but the swap couldn't be completed. A refund has been started automatically.",showClose:!0,onClose:t,primaryCta:{label:"Done",onClick:t},secondaryCta:{label:"View transaction details",onClick:()=>window.open(o.tracking_url,"_blank","noopener,noreferrer")},watermark:!0})}function lr(){let{close:e,setModalState:t,config:o}=f(),{confirm:n,currencies:i,isFetching:a}=function(){let{config:s,setModalState:c}=f(),{fetchQuote:m,isFetching:h}=G(),y=s.status==="ready"?s.data.currencies:[];return{confirm:p.useCallback(async g=>{if(s.status!=="ready"||!g)return;let E=function(S,ne){return S.chains.map(b=>{let C=ne.chains[b.chainId];return C?{chainId:b.chainId,caip2:C.caip2,displayName:C.displayName,iconUrl:C.iconUrl,vmType:C.vmType,currencyAddress:b.address,currencyDecimals:b.decimals}:null}).filter(b=>b!==null)}(g,s.data);if(E.length!==1)c({step:"network",selectedCurrency:g,availableChains:E});else{let S=E[0];await m(S,g,E)}},[s,m,c]),currencies:y,isFetching:h}}(),[l,u]=p.useState(-1);return r.jsx(v,{title:"Select token",showBack:!0,onBack:()=>t({step:"intro"}),showClose:!0,onClose:e,watermark:!0,children:o.status==="error"?r.jsx(W,{children:r.jsx(Ye,{children:"Failed to load tokens"})}):o.status==="loading"?r.jsx(W,{children:r.jsx(q,{})}):r.jsx(X,{style:{marginTop:"1rem",height:"22rem"},$colorScheme:"light",children:i.map((s,c)=>r.jsxs(te,{$selected:l===c,disabled:a,onClick:()=>{u(c),n(s)},children:[r.jsx(Z,{src:s.logoURI,alt:s.symbol}),r.jsx(re,{children:s.name}),a&&c===l?r.jsx(oe,{}):r.jsx(Qe,{children:s.symbol})]},s.symbol))})})}function dr({address:e,onClick:t}){let[o,n]=p.useState(!1);return r.jsx(r.Fragment,{children:o?r.jsx(cr,{onClick:()=>n(!1),style:{marginTop:"1.5rem"},children:r.jsx(me,{url:e,size:312,hideLogo:!0})}):r.jsxs(ur,{title:"Click to copy address",onClick:t,style:{marginTop:"1.5rem"},children:[r.jsxs(mr,{children:[r.jsx(pr,{children:"Deposit address"}),r.jsx(hr,{children:e})]}),r.jsx(fr,{children:r.jsx(gr,{type:"button",onClick:i=>{i.stopPropagation(),n(!0)},children:r.jsx(Q,{size:16,color:"var(--privy-color-icon-muted)"})})})]})})}let cr=d.div`
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
`,ur=d.div`
  display: flex;
  border-radius: var(--privy-border-radius-md);
  background: var(--privy-color-background-clicked, #f1f2f9);
  padding: 1rem;
  cursor: pointer;
  gap: 0.5rem;
`,mr=d.div`
  flex: 1;
  min-width: 0;
  text-align: left;
`,pr=d.div`
  font-size: 0.75rem;
  color: var(--privy-color-icon-muted);
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,hr=d.div`
  word-break: break-all;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
  font-weight: 500;
  line-height: 1.375rem;
  color: var(--privy-color-foreground);
`,fr=d.div`
  width: 1.5rem;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 0.25rem;
`,gr=d.button`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    border-radius: var(--privy-border-radius-xs);

    &:hover {
      background: var(--privy-color-background);
    }

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`;function yr({quote:e,selectedCurrency:t,selectedChain:o,destinationSymbol:n}){let[i,a]=p.useState(!1),l=t.symbol.toUpperCase(),u=o.displayName,s=p.useRef(null);return r.jsxs(br,{children:[r.jsxs(vr,{onClick:p.useCallback(()=>{let c=document.getElementById("privy-modal-content");c&&(s.current&&clearTimeout(s.current),c.style.transition="none",s.current=setTimeout(()=>{c.style.transition="",s.current=null},160)),a(m=>!m)},[]),children:[r.jsxs(xr,{children:[t.logoURI&&r.jsx(Z,{src:t.logoURI,alt:l,style:{width:"2rem",height:"2rem"}}),o.iconUrl&&r.jsx(Cr,{src:o.iconUrl,alt:u})]}),r.jsxs(wr,{children:[r.jsx(kr,{children:"You send"}),r.jsxs(Er,{children:[l," on ",u]})]}),r.jsx(_r,{children:r.jsx(i?De:ce,{size:16})})]}),r.jsx(Nr,{$expanded:i,children:r.jsx(Ur,{children:r.jsxs(jr,{children:[e.indicative_rate&&r.jsxs(O,{children:[r.jsx(R,{children:"Conversion rate"}),r.jsxs(D,{style:{display:"flex",alignItems:"center",gap:"0.25rem"},children:[ze(e.indicative_rate,l,n.toUpperCase()),r.jsx(Ir,{content:"Estimated rate based on current market conditions. Final execution price may vary depending on transfer size and routing."})]})]}),r.jsxs(O,{children:[r.jsx(R,{children:"Max slippage"}),r.jsxs(D,{children:[(e.slippage_bps/100).toFixed(1),"%"]})]}),r.jsxs(O,{children:[r.jsx(R,{children:"Refund address"}),r.jsx(D,{children:r.jsx(Te,{value:e.refund_address,iconOnly:!0,iconSize:11,children:ae(e.refund_address,4,4)})})]})]})})}),r.jsxs(Tr,{children:[r.jsx(F,{size:16,color:"var(--privy-color-icon-muted)",style:{flexShrink:0}}),r.jsxs(Sr,{children:["Only send ",r.jsx("strong",{children:l})," on ",r.jsx("strong",{children:u}),". Other assets may be lost."]})]})]})}let br=d.div`
  border-radius: var(--privy-border-radius-md);
  border: 1px solid var(--privy-color-foreground-4);
  overflow: hidden;
`,vr=d.button`
  && {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--privy-color-foreground);
    outline: none;
    box-shadow: none;

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`,xr=d.span`
  position: relative;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
`,Cr=d(ee)`
  && {
    position: absolute;
    top: -0.125rem;
    right: -0.25rem;
    width: 0.75rem;
    height: 0.75rem;
    box-sizing: content-box;
    border: 1.5px solid #fff;
    background-color: #fff;
  }
`,wr=d.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,kr=d.span`
  font-size: 0.75rem;
  color: var(--privy-color-foreground-3);
  line-height: 1rem;
`,Er=d.span`
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
`,_r=d.span`
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-clicked, #f1f2f9);
  color: var(--privy-color-foreground-3);
`,jr=d.div`
  display: flex;
  flex-direction: column;
  padding: 0 1rem 0.75rem;

  & > * {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--privy-color-foreground-4);
  }

  & > *:last-child {
    border-bottom: none;
  }
`,Tr=d.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.75rem 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--privy-border-radius-sm);
  background: #f8f9fc;
`,Sr=d.span`
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--privy-color-icon-muted);
  text-align: left;
`,Nr=d.div`
  display: grid;
  grid-template-rows: ${({$expanded:e})=>e?"1fr":"0fr"};
  transition: grid-template-rows 150ms ease-out;
`,Ur=d.div`
  overflow: hidden;
`;function Ir({content:e}){let[t,o]=p.useState(!1),{refs:n,floatingStyles:i,context:a}=pe({open:t,onOpenChange:o,placement:"top",whileElementsMounted:ke,middleware:[Ee(6),_e(),je({padding:8})]}),l=he(a,{move:!1,handleClose:fe()}),u=ge(a),{getReferenceProps:s,getFloatingProps:c}=ye([l,u,be(a),ve(a),xe(a,{role:"tooltip"})]),{isMounted:m,styles:h}=Ce(a,{duration:150});return r.jsxs(r.Fragment,{children:[r.jsx("button",{ref:n.setReference,type:"button","aria-label":"More information about conversion rate",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0,border:"none",background:"none",color:"var(--privy-color-icon-muted)",cursor:"pointer"},...s(),children:r.jsx(Fe,{size:14})}),m&&r.jsx(we,{root:document.getElementById("privy-modal-content")??void 0,children:r.jsx(Or,{ref:n.setFloating,style:{...i,...h},...c(),children:e})})]})}let Or=d.div`
  max-width: 13rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--privy-border-radius-sm, 0.375rem);
  background: var(--privy-color-foreground);
  color: var(--privy-color-background);
  font-size: 0.6875rem;
  line-height: 1rem;
  font-weight: 400;
  text-align: left;
  z-index: 10;
`;const Rr=({quote:e,selectedCurrency:t,selectedChain:o,destinationSymbol:n,onBack:i,onClose:a})=>{var h;let[l,u]=p.useState(!1),s=((h=t==null?void 0:t.symbol)==null?void 0:h.toUpperCase())??"funds",c=(o==null?void 0:o.displayName)??"",m=async()=>{l||(await navigator.clipboard.writeText(e.deposit_address),u(!0),setTimeout(()=>u(!1),2e3))};return r.jsxs(v,{title:`Send ${s}${c?` on ${c}`:""}`,subtitle:"Send funds to the address below. Conversion and routing handled by Relay.",showBack:!0,onBack:i,showClose:!0,onClose:a,watermark:!1,children:[r.jsx(yr,{quote:e,selectedCurrency:t,selectedChain:o,destinationSymbol:n}),r.jsx(dr,{address:e.deposit_address,onClick:m}),r.jsx(ue,{style:{marginTop:"1rem",marginBottom:"0.5rem",...l?{backgroundColor:"var(--privy-color-icon-success)",borderColor:"var(--privy-color-icon-success)"}:{}},onClick:m,children:l?r.jsxs(r.Fragment,{children:["Copied ",r.jsx($,{size:16,style:{marginLeft:"0.25rem"}})]}):"Copy address"}),r.jsx(Dr,{children:"Routing and bridging are handled by Relay. Privy does not control execution timing, liquidity, or transaction outcomes."})]})};let Dr=d.p`
  && {
    margin: 0.5rem 0 0;
    font-size: 0.6875rem;
    line-height: 1.125rem;
    color: var(--privy-color-icon-muted);
    text-align: center;
  }
`;function Ar(){let{state:e,configData:t,setModalState:o,close:n,params:i}=x("address"),{quote:a,selectedCurrency:l,selectedChain:u,availableChains:s}=e;return Xe({depositAddressId:a.id,enabled:!0,quoteCreatedAt:a.created_at}),r.jsx(Rr,{quote:a,selectedCurrency:l,selectedChain:u,destinationSymbol:p.useMemo(()=>A({address:i.destinationCurrency,caip2:i.destinationChain,config:t}).symbol,[i,t]),onBack:()=>o({step:"network",selectedCurrency:l,availableChains:s}),onClose:n})}function Fr(){let{modalState:e,setModalState:t}=f();return r.jsx(Le,{onError:o=>t({step:"error",code:"UNEXPECTED_STATE",message:o.message}),resetKey:e.step,children:r.jsx($r,{})})}function $r(){let{modalState:e}=f();switch(e.step){case"intro":return r.jsx(tr,{});case"token":return r.jsx(lr,{});case"network":return r.jsx(or,{});case"address":return r.jsx(Ar,{});case"processing":return r.jsx(ir,{});case"complete":return r.jsx(Je,{});case"refunded":return r.jsx(ar,{});case"failed":return r.jsx(er,{});case"error":return r.jsx(Ze,{});default:return null}}var et={component:()=>{let{onUserCloseViaDialogOrKeybindRef:e}=ie(),t=w(),{close:o,config:n}=f();return p.useEffect(()=>{e.current=o},[e,o]),p.useEffect(()=>{if(n.status==="ready"){for(let i of n.data.currencies)new Image().src=i.logoURI;for(let i of Object.values(n.data.chains))new Image().src=i.iconUrl}},[n]),t?r.jsx(Fr,{}):null}};export{et as default};
