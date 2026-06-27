import{dm as a,dN as _,dk as I,dh as T,dj as e,ez as E,eA as F,e5 as N,dF as p,eh as U}from"./index-BaFnVtk-.js";import{F as W}from"./ShieldCheckIcon-DLLU4_9r.js";import{m as O}from"./ModalHeader-rFKqcgRs-DsTNQbKt.js";import{l as V}from"./Layouts-BlFm53ED-BQ4BjBZx.js";import{g as z,h as H,u as M,b as B,k as D}from"./shared-wENLua4u-lh2C0n00.js";import{w as s}from"./Screen-DXLhhfU3-CZrhXcxc.js";import"./index-Dq_xe9dz-tXjqv1a1.js";const re={component:()=>{let[o,y]=a.useState(!0),{authenticated:m,user:j}=_(),{walletProxy:i,closePrivyModal:v,createAnalyticsEvent:x,client:b}=I(),{navigate:k,data:C,onUserCloseViaDialogOrKeybindRef:$}=T(),[l,A]=a.useState(void 0),[f,d]=a.useState(""),[c,g]=a.useState(!1),{entropyId:h,entropyIdVerifier:S,onCompleteNavigateTo:w,onSuccess:u,onFailure:P}=C.recoverWallet,n=(r="User exited before their wallet could be recovered")=>{v({shouldCallAuthOnSuccess:!1}),P(typeof r=="string"?new N(r):r)};return $.current=n,a.useEffect(()=>{if(!m)return n("User must be authenticated and have a Privy wallet before it can be recovered")},[m]),e.jsxs(s,{children:[e.jsx(s.Header,{icon:W,title:"Enter your password",subtitle:"Please provision your account on this new device. To continue, enter your recovery password.",showClose:!0,onClose:n}),e.jsx(s.Body,{children:e.jsx(K,{children:e.jsxs("div",{children:[e.jsxs(z,{children:[e.jsx(H,{type:o?"password":"text",onChange:r=>(t=>{t&&A(t)})(r.target.value),disabled:c,style:{paddingRight:"2.3rem"}}),e.jsx(M,{style:{right:"0.75rem"},children:o?e.jsx(B,{onClick:()=>y(!1)}):e.jsx(D,{onClick:()=>y(!0)})})]}),!!f&&e.jsx(Y,{children:f})]})})}),e.jsxs(s.Footer,{children:[e.jsx(s.HelpText,{children:e.jsxs(V,{children:[e.jsx("h4",{children:"Why is this necessary?"}),e.jsx("p",{children:"You previously set a password for this wallet. This helps ensure only you can access it"})]})}),e.jsx(s.Actions,{children:e.jsx(G,{loading:c||!i,disabled:!l,onClick:async()=>{g(!0);let r=await b.getAccessToken(),t=E(j,h);if(!r||!t||l===null)return n("User must be authenticated and have a Privy wallet before it can be recovered");try{x({eventName:"embedded_wallet_recovery_started",payload:{walletAddress:t.address}}),await(i==null?void 0:i.recover({accessToken:r,entropyId:h,entropyIdVerifier:S,recoveryPassword:l})),d(""),w?k(w):v({shouldCallAuthOnSuccess:!1}),u==null||u(t),x({eventName:"embedded_wallet_recovery_completed",payload:{walletAddress:t.address}})}catch(R){F(R)?d("Invalid recovery password, please try again."):d("An error has occurred, please try again.")}finally{g(!1)}},$hideAnimations:!h&&c,children:"Recover your account"})}),e.jsx(s.Watermark,{})]})]})}};let K=p.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,Y=p.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,G=p(O)`
  ${({$hideAnimations:o})=>o&&U`
      && {
        // Remove animations because the recoverWallet task on the iframe partially
        // blocks the renderer, so the animation stutters and doesn't look good
        transition: none;
      }
    `}
`;export{re as PasswordRecoveryScreen,re as default};
