import{dN as R,dk as U,dh as P,dm as u,dj as e,en as v,ez as j,dJ as W,dF as A}from"./index-C9QBnX5l.js";import{F as M}from"./ExclamationTriangleIcon-DI4N-Hd5.js";import{F as V}from"./LockClosedIcon-BhNrX8b2.js";import{T as S,k as b,u as $}from"./ModalHeader-rFKqcgRs-Dm454XRy.js";import{r as H}from"./Subtitle-CV-2yKE4-aNgWBn43.js";import{e as k}from"./Title-BnzYV3Is-D9Cks_6V.js";const N=A.div`
  && {
    border-width: 4px;
  }

  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  aspect-ratio: 1;
  border-style: solid;
  border-color: ${i=>i.$color??"var(--privy-color-accent)"};
  border-radius: 50%;
`,q={component:()=>{var p;let{user:i}=R(),{client:T,walletProxy:m,refreshSessionAndUser:F,closePrivyModal:l}=U(),s=P(),{entropyId:f,entropyIdVerifier:C}=((p=s.data)==null?void 0:p.recoverWallet)??{},[n,h]=u.useState(!1),[c,E]=u.useState(null),[d,g]=u.useState(null);function y(){var r,o,t,a;if(!n){if(d)return(o=(r=s.data)==null?void 0:r.setWalletPassword)==null||o.onFailure(d),void l();if(!c)return(a=(t=s.data)==null?void 0:t.setWalletPassword)==null||a.onFailure(Error("User exited set recovery flow")),void l()}}s.onUserCloseViaDialogOrKeybindRef.current=y;let I=!(!n&&!c);return e.jsxs(e.Fragment,d?{children:[e.jsx(S,{onClose:y},"header"),e.jsx(N,{$color:"var(--privy-color-error)",style:{alignSelf:"center"},children:e.jsx(M,{height:38,width:38,stroke:"var(--privy-color-error)"})}),e.jsx(k,{style:{marginTop:"0.5rem"},children:"Something went wrong"}),e.jsx(v,{style:{minHeight:"2rem"}}),e.jsx(b,{onClick:()=>g(null),children:"Try again"}),e.jsx($,{})]}:{children:[e.jsx(S,{onClose:y},"header"),e.jsx(V,{style:{width:"3rem",height:"3rem",alignSelf:"center"}}),e.jsx(k,{style:{marginTop:"0.5rem"},children:"Automatically secure your account"}),e.jsx(H,{style:{marginTop:"1rem"},children:"When you log into a new device, you’ll only need to authenticate to access your account. Never get logged out if you forget your password."}),e.jsx(v,{style:{minHeight:"2rem"}}),e.jsx(b,{loading:n,disabled:I,onClick:()=>async function(){h(!0);try{let r=await T.getAccessToken(),o=j(i,f);if(!r||!m||!o)return;if(!(await m.setRecovery({accessToken:r,entropyId:f,entropyIdVerifier:C,existingRecoveryMethod:o.recoveryMethod,recoveryMethod:"privy"})).entropyId)throw Error("Unable to set recovery on wallet");let t=await F();if(!t)throw Error("Unable to set recovery on wallet");let a=j(t,o.address);if(!a)throw Error("Unabled to set recovery on wallet");E(!!t),setTimeout(()=>{var w,x;(x=(w=s.data)==null?void 0:w.setWalletPassword)==null||x.onSuccess(a),l()},W)}catch(r){g(r)}finally{h(!1)}}(),children:c?"Success":"Confirm"}),e.jsx($,{})]})}};export{q as SetAutomaticRecoveryScreen,q as default};
