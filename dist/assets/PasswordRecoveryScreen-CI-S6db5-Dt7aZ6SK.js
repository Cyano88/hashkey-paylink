import{r as a,k as _,I,g as T,j as e,cQ as E,cR as F,bh as U,a as p,bo as W}from"./index-D4B3wXyP.js";import{F as N}from"./ShieldCheckIcon--QtrCyiy.js";import{m as O}from"./ModalHeader-rFKqcgRs-Cosg7UQ2.js";import{l as V}from"./Layouts-BlFm53ED-BDNJCjHv.js";import{g as H,h as z,u as M,b as B,k as D}from"./shared-wENLua4u-DwGz8pXf.js";import{w as s}from"./Screen-DXLhhfU3-BbRPBdiW.js";import"./index-Dq_xe9dz-DdiZUnP7.js";const re={component:()=>{let[o,y]=a.useState(!0),{authenticated:m,user:b}=_(),{walletProxy:i,closePrivyModal:v,createAnalyticsEvent:x,client:j}=I(),{navigate:k,data:C,onUserCloseViaDialogOrKeybindRef:$}=T(),[l,A]=a.useState(void 0),[f,c]=a.useState(""),[d,g]=a.useState(!1),{entropyId:h,entropyIdVerifier:R,onCompleteNavigateTo:w,onSuccess:u,onFailure:S}=C.recoverWallet,n=(r="User exited before their wallet could be recovered")=>{v({shouldCallAuthOnSuccess:!1}),S(typeof r=="string"?new U(r):r)};return $.current=n,a.useEffect(()=>{if(!m)return n("User must be authenticated and have a Privy wallet before it can be recovered")},[m]),e.jsxs(s,{children:[e.jsx(s.Header,{icon:N,title:"Enter your password",subtitle:"Please provision your account on this new device. To continue, enter your recovery password.",showClose:!0,onClose:n}),e.jsx(s.Body,{children:e.jsx(K,{children:e.jsxs("div",{children:[e.jsxs(H,{children:[e.jsx(z,{type:o?"password":"text",onChange:r=>(t=>{t&&A(t)})(r.target.value),disabled:d,style:{paddingRight:"2.3rem"}}),e.jsx(M,{style:{right:"0.75rem"},children:o?e.jsx(B,{onClick:()=>y(!1)}):e.jsx(D,{onClick:()=>y(!0)})})]}),!!f&&e.jsx(Q,{children:f})]})})}),e.jsxs(s.Footer,{children:[e.jsx(s.HelpText,{children:e.jsxs(V,{children:[e.jsx("h4",{children:"Why is this necessary?"}),e.jsx("p",{children:"You previously set a password for this wallet. This helps ensure only you can access it"})]})}),e.jsx(s.Actions,{children:e.jsx(Y,{loading:d||!i,disabled:!l,onClick:async()=>{g(!0);let r=await j.getAccessToken(),t=E(b,h);if(!r||!t||l===null)return n("User must be authenticated and have a Privy wallet before it can be recovered");try{x({eventName:"embedded_wallet_recovery_started",payload:{walletAddress:t.address}}),await(i==null?void 0:i.recover({accessToken:r,entropyId:h,entropyIdVerifier:R,recoveryPassword:l})),c(""),w?k(w):v({shouldCallAuthOnSuccess:!1}),u==null||u(t),x({eventName:"embedded_wallet_recovery_completed",payload:{walletAddress:t.address}})}catch(P){F(P)?c("Invalid recovery password, please try again."):c("An error has occurred, please try again.")}finally{g(!1)}},$hideAnimations:!h&&d,children:"Recover your account"})}),e.jsx(s.Watermark,{})]})]})}};let K=p.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,Q=p.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,Y=p(O)`
  ${({$hideAnimations:o})=>o&&W`
      && {
        // Remove animations because the recoverWallet task on the iframe partially
        // blocks the renderer, so the animation stutters and doesn't look good
        transition: none;
      }
    `}
`;export{re as PasswordRecoveryScreen,re as default};
