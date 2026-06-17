import{dp as L,gf as q,di as t,gg as y,gh as a,gi as M,gj as z,fB as R,gk as T,dj as m}from"./index-CwM9WefR.js";import{a as D}from"./poll-CGBuN8pf-wxoeUYuW.js";import{y as I,c as Q,p as U}from"./SelectSourceAsset-BXIwUEql-haAMXYyV.js";import{n as x}from"./ScreenLayout-Dmp7r6fS-Dl2HE6Ls.js";import{t as B,h as N}from"./GooglePay-DA-Ff7zK-CsbdQf8j.js";import{T as W}from"./triangle-alert-yrIPCzK8.js";import{c as v}from"./createLucideIcon-B-ErGjvb.js";import{C as Y}from"./circle-x-B7d9W1fy.js";import{C as G}from"./check-CU4DH243.js";import{W as O}from"./wallet-CZhkvdMP.js";import{S as b}from"./smartphone-C9nbcZ1S.js";import"./ModalHeader-rFKqcgRs-Bvm0jmhO.js";import"./Screen-DXLhhfU3-DOeEizyF.js";import"./index-Dq_xe9dz-BKD7zWph.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=[["path",{d:"M12 10h.01",key:"1nrarc"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M12 6h.01",key:"1vi96p"}],["path",{d:"M16 10h.01",key:"1m94wz"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M16 6h.01",key:"1x0f13"}],["path",{d:"M8 10h.01",key:"19clt8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M8 6h.01",key:"1dz90k"}],["path",{d:"M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",key:"cabbwy"}],["rect",{x:"4",y:"2",width:"16",height:"20",rx:"2",key:"1uxh74"}]],k=v("building",$);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],X=v("chevron-right",F);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],w=v("credit-card",H);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M10 18v-7",key:"wt116b"}],["path",{d:"M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z",key:"1m329m"}],["path",{d:"M14 18v-7",key:"vav6t3"}],["path",{d:"M18 18v-7",key:"aexdmj"}],["path",{d:"M3 22h18",key:"8prr45"}],["path",{d:"M6 18v-7",key:"1ivflk"}]],f=v("landmark",K),[S,V]=((e,o=750)=>{let s;return[(...r)=>{s&&clearTimeout(s),s=setTimeout(()=>{e(...r)},o)},()=>{s&&clearTimeout(s)}]})(async(e,o)=>{a({isLoading:!0});try{let{getQuotes:s}=y(),r=await s({source:{asset:o.source.selectedAsset.toUpperCase(),amount:e},destination:{asset:o.destination.asset.toUpperCase(),chain:o.destination.chain,address:o.destination.address},environment:o.environment}),i=r.quotes??[],p=r.provider_errors,d=T(i,e);a({localQuotes:i,localSelectedQuote:i[0]??null,isLoading:!1,quotesWarning:d,quotesErrors:p??null})}catch{a({localQuotes:[],localSelectedQuote:null,quotesWarning:"provider_errors",quotesErrors:null})}}),J=e=>{a({amount:e});let{opts:o}=y();S(e,o)},E=async()=>{let{error:e,state:o,onFailure:s,onSuccess:r}=y();V(),e?s(e):o.status==="provider-success"?await r({status:"confirmed"}):o.status==="provider-confirming"?await r({status:"submitted"}):s(Error("User exited flow"))},Z=async()=>{var h,g;let e,o=z();if(!o)return;let s=R();if(!s)return void a({state:{status:"provider-error"},error:Error("Unable to open payment window")});a({isLoading:!0});let{opts:r,amount:i,getProviderUrl:p,getStatus:d,controller:c}=y(),u=()=>{try{s.closed||s.close()}catch{}};c.current=new AbortController;try{let l=await p({source:{asset:r.source.selectedAsset.toUpperCase(),amount:i||"0"},destination:{asset:r.destination.asset.toUpperCase(),chain:r.destination.chain,address:r.destination.address},provider:o.provider,sub_provider:o.sub_provider??void 0,payment_method:o.payment_method,redirect_url:window.location.origin});s.location.href=l.url,e=l.session_id}catch{return u(),void a({state:{status:"provider-error"},isLoading:!1,error:Error("Unable to start payment session")})}a({isLoading:!1}),a({state:{status:"provider-confirming"}});let n=await D({operation:()=>d({session_id:e,provider:o.provider}),until:l=>l.status==="completed"||l.status==="failed"||l.status==="cancelled",delay:0,interval:2e3,attempts:60,signal:c.current.signal});if(n.status!=="aborted"){if(n.status==="max_attempts")return u(),n.error?(console.error(n.error),void a({state:{status:"select-amount"},isLoading:!1,error:Error("Unable to check payment status. Please try again.")})):void a({state:{status:"provider-error"},error:Error("Could not confirm payment status yet.")});((h=n.result)==null?void 0:h.status)==="completed"?(u(),a({state:{status:"provider-success"}})):(u(),a({state:{status:"provider-error"},error:Error(`Transaction ${((g=n.result)==null?void 0:g.status)??"failed"}`)}))}},ee=()=>{let e=M();e&&e.length>0&&a({state:{status:"select-payment-method",quotes:e}})},te=()=>{a({state:{status:"select-source-asset"}})},oe=()=>{a({error:null,state:{status:"select-amount"}})},se=e=>{a({localSelectedQuote:e,state:{status:"select-amount"}})},re=e=>{let{opts:o,amount:s}=y(),r={...o,source:{...o.source,selectedAsset:e}};a({opts:r,state:{status:"select-amount"}}),S(s,r)},ne=({onClose:e})=>t.jsx(x,{showClose:!0,onClose:e,iconVariant:"loading",title:"Processing transaction",subtitle:"Your purchase is in progress. You can leave this screen — we’ll notify you when it’s complete.",primaryCta:{label:"Done",onClick:e},watermark:!0}),ae=({onClose:e,onRetry:o})=>t.jsx(x,{showClose:!0,onClose:e,icon:Y,iconVariant:"error",title:"Something went wrong",subtitle:"We couldn't complete your transaction. Please try again.",primaryCta:{label:"Try again",onClick:o},secondaryCta:{label:"Close",onClick:e},watermark:!0}),ie=({onClose:e})=>t.jsx(x,{showClose:!0,onClose:e,icon:G,iconVariant:"success",title:"Transaction confirmed",subtitle:"Your purchase is processing. Funds should arrive in your wallet within a few minutes.",primaryCta:{label:"Done",onClick:e},watermark:!0});let le={CREDIT_DEBIT_CARD:"card",APPLE_PAY:"Apple Pay",GOOGLE_PAY:"Google Pay",BANK_TRANSFER:"bank deposit",ACH:"bank deposit",SEPA:"bank deposit",PIX:"PIX"},de={CREDIT_DEBIT_CARD:t.jsx(w,{size:14}),APPLE_PAY:t.jsx(b,{size:14}),GOOGLE_PAY:t.jsx(b,{size:14}),BANK_TRANSFER:t.jsx(k,{size:14}),ACH:t.jsx(k,{size:14}),SEPA:t.jsx(k,{size:14}),PIX:t.jsx(O,{size:14})},ce=e=>de[e]??t.jsx(w,{size:14});const ue=({opts:e,onClose:o,onEditSourceAsset:s,onEditPaymentMethod:r,onContinue:i,onAmountChange:p,amount:d,selectedQuote:c,quotesWarning:u,quotesErrors:n,quotesCount:h,isLoading:g})=>{var C;return t.jsxs(x,{showClose:!0,onClose:o,headerTitle:`Buy ${e.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:"Continue",onClick:i,loading:g,disabled:!c},helpText:u?t.jsxs(pe,{children:[t.jsx(W,{size:16,strokeWidth:2}),t.jsx(me,{children:t.jsxs(t.Fragment,u==="amount_too_low"?{children:[t.jsx(_,{children:"Amount too low"}),t.jsx(P,{children:"Please choose a higher amount to continue."})]}:{children:[t.jsx(_,{children:"Unable to get quotes"}),t.jsx(P,{children:((C=n==null?void 0:n[0])==null?void 0:C.error)??"Something went wrong. Please try again."})]})})]}):c&&h>1?t.jsxs(he,{onClick:r,children:[ce(c.payment_method),t.jsxs("span",{children:["Pay with ",(l=c.payment_method,le[l]??l.replace(/_/g," ").toLowerCase().replace(/^\w/,A=>A.toUpperCase()))]}),t.jsx(X,{size:14})]}):null,watermark:!0,children:[t.jsx(Q,{currency:e.source.selectedAsset,value:d,onChange:p,inputMode:"decimal",autoFocus:!0}),t.jsx(U,{selectedAsset:e.source.selectedAsset,onEditSourceAsset:s})]});var l};let pe=m.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background-color: var(--privy-color-warn-bg, #fffbbb);
  border: 1px solid var(--privy-color-border-warning, #facd63);
  overflow: clip;
  width: 100%;

  svg {
    flex-shrink: 0;
    color: var(--privy-color-icon-warning, #facd63);
  }
`,me=m.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--privy-color-foreground);
  font-feature-settings:
    'calt' 0,
    'kern' 0;
  text-align: left;
`,_=m.span`
  font-weight: 600;
`,P=m.span`
  font-weight: 400;
`,he=m.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;

  && {
    padding: 0;
    color: var(--privy-color-accent);
    font-size: 0.875rem;
    font-style: normal;
    font-weight: 500;
    line-height: 1.375rem;
  }
`,ge={CREDIT_DEBIT_CARD:"Credit / debit card",APPLE_PAY:"Apple Pay",GOOGLE_PAY:"Google Pay",BANK_TRANSFER:"Bank transfer",ACH:"ACH",SEPA:"SEPA",PIX:"PIX"},ye={CREDIT_DEBIT_CARD:t.jsx(w,{size:20}),APPLE_PAY:t.jsx(N,{width:20,height:20}),GOOGLE_PAY:t.jsx(B,{width:20,height:20}),BANK_TRANSFER:t.jsx(f,{size:20}),ACH:t.jsx(f,{size:20}),SEPA:t.jsx(f,{size:20}),PIX:t.jsx(f,{size:20})},xe=e=>ye[e]??t.jsx(w,{size:20});const Ce=({onClose:e,onSelectPaymentMethod:o,quotes:s,isLoading:r})=>t.jsx(x,{showClose:!0,onClose:e,title:"Select payment method",subtitle:"Choose how you'd like to pay",watermark:!0,children:t.jsx(fe,{children:s.map((i,p)=>{return t.jsx(ve,{onClick:()=>o(i),disabled:r,children:t.jsxs(we,{children:[t.jsx(Ae,{children:xe(i.payment_method)}),t.jsx(je,{children:t.jsx(ke,{children:(d=i.payment_method,ge[d]??d.replace(/_/g," ").toLowerCase().replace(/^\w/,c=>c.toUpperCase()))})})]})},`${i.provider}-${i.payment_method}-${p}`);var d})})});let fe=m.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
`,ve=m.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-md);
  border-style: solid;
  display: flex;

  && {
    padding: 1rem 1rem;
  }
`,we=m.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,Ae=m.div`
  color: var(--privy-color-foreground-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`,je=m.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  flex: 1;
`,ke=m.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.25rem;
`;const be=({onClose:e,onContinue:o,onAmountChange:s,onSelectSource:r,onEditSourceAsset:i,onEditPaymentMethod:p,onSelectPaymentMethod:d,onRetry:c,opts:u,state:n,amount:h,selectedQuote:g,quotesWarning:l,quotesErrors:C,quotesCount:A,isLoading:j})=>n.status==="select-amount"?t.jsx(ue,{onClose:e,onContinue:o,onAmountChange:s,onEditSourceAsset:i,onEditPaymentMethod:p,opts:u,amount:h,selectedQuote:g,quotesWarning:l,quotesErrors:C,quotesCount:A,isLoading:j}):n.status==="select-source-asset"?t.jsx(I,{onSelectSource:r,opts:u,isLoading:j}):n.status==="select-payment-method"?t.jsx(Ce,{onClose:e,onSelectPaymentMethod:d,quotes:n.quotes,isLoading:j}):n.status==="provider-confirming"?t.jsx(ne,{onClose:e}):n.status==="provider-error"?t.jsx(ae,{onClose:e,onRetry:c}):n.status==="provider-success"?t.jsx(ie,{onClose:e}):null,Be={component:()=>{var l;let{onUserCloseViaDialogOrKeybindRef:e}=L(),o=q();if(!o)return null;let{opts:s,state:r,isLoading:i,amount:p,quotesWarning:d,quotesErrors:c,localQuotes:u,localSelectedQuote:n,initialQuotes:h,initialSelectedQuote:g}=o;return e.current=E,t.jsx(be,{onClose:E,opts:s,state:r,isLoading:i,amount:p,selectedQuote:n??g,quotesWarning:d,quotesErrors:c,quotesCount:((l=u??h)==null?void 0:l.length)??0,onAmountChange:J,onContinue:Z,onSelectSource:re,onEditSourceAsset:te,onEditPaymentMethod:ee,onSelectPaymentMethod:se,onRetry:oe})}};export{Be as FiatOnrampScreen,Be as default};
