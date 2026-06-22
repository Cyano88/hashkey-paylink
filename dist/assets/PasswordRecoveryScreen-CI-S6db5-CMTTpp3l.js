import{dt as a,dX as _,dr as I,dp as T,di as e,eA as E,eB as F,ek as U,dj as p,dG as W}from"./index-Bpz2ecF8.js";import{F as N}from"./ShieldCheckIcon-CnpRvnnh.js";import{m as O}from"./ModalHeader-rFKqcgRs-C2RcMfKT.js";import{l as V}from"./Layouts-BlFm53ED-Bnhilxux.js";import{g as H,h as z,u as B,b as M,k as D}from"./shared-wENLua4u-B67d4cLl.js";import{w as s}from"./Screen-DXLhhfU3-BTjojUve.js";import"./index-Dq_xe9dz-y86Uw2Oj.js";const re={component:()=>{let[o,y]=a.useState(!0),{authenticated:m,user:j}=_(),{walletProxy:i,closePrivyModal:v,createAnalyticsEvent:x,client:b}=I(),{navigate:k,data:C,onUserCloseViaDialogOrKeybindRef:$}=T(),[l,A]=a.useState(void 0),[f,d]=a.useState(""),[c,g]=a.useState(!1),{entropyId:u,entropyIdVerifier:S,onCompleteNavigateTo:w,onSuccess:h,onFailure:P}=C.recoverWallet,n=(r="User exited before their wallet could be recovered")=>{v({shouldCallAuthOnSuccess:!1}),P(typeof r=="string"?new U(r):r)};return $.current=n,a.useEffect(()=>{if(!m)return n("User must be authenticated and have a Privy wallet before it can be recovered")},[m]),e.jsxs(s,{children:[e.jsx(s.Header,{icon:N,title:"Enter your password",subtitle:"Please provision your account on this new device. To continue, enter your recovery password.",showClose:!0,onClose:n}),e.jsx(s.Body,{children:e.jsx(G,{children:e.jsxs("div",{children:[e.jsxs(H,{children:[e.jsx(z,{type:o?"password":"text",onChange:r=>(t=>{t&&A(t)})(r.target.value),disabled:c,style:{paddingRight:"2.3rem"}}),e.jsx(B,{style:{right:"0.75rem"},children:o?e.jsx(M,{onClick:()=>y(!1)}):e.jsx(D,{onClick:()=>y(!0)})})]}),!!f&&e.jsx(K,{children:f})]})})}),e.jsxs(s.Footer,{children:[e.jsx(s.HelpText,{children:e.jsxs(V,{children:[e.jsx("h4",{children:"Why is this necessary?"}),e.jsx("p",{children:"You previously set a password for this wallet. This helps ensure only you can access it"})]})}),e.jsx(s.Actions,{children:e.jsx(X,{loading:c||!i,disabled:!l,onClick:async()=>{g(!0);let r=await b.getAccessToken(),t=E(j,u);if(!r||!t||l===null)return n("User must be authenticated and have a Privy wallet before it can be recovered");try{x({eventName:"embedded_wallet_recovery_started",payload:{walletAddress:t.address}}),await(i==null?void 0:i.recover({accessToken:r,entropyId:u,entropyIdVerifier:S,recoveryPassword:l})),d(""),w?k(w):v({shouldCallAuthOnSuccess:!1}),h==null||h(t),x({eventName:"embedded_wallet_recovery_completed",payload:{walletAddress:t.address}})}catch(R){F(R)?d("Invalid recovery password, please try again."):d("An error has occurred, please try again.")}finally{g(!1)}},$hideAnimations:!u&&c,children:"Recover your account"})}),e.jsx(s.Watermark,{})]})]})}};let G=p.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,K=p.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,X=p(O)`
  ${({$hideAnimations:o})=>o&&W`
      && {
        // Remove animations because the recoverWallet task on the iframe partially
        // blocks the renderer, so the animation stutters and doesn't look good
        transition: none;
      }
    `}
`;export{re as PasswordRecoveryScreen,re as default};
