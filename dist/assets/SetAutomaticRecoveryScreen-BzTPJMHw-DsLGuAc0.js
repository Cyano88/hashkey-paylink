import{k as R,I as U,g as P,r as u,j as e,bT as v,cQ as j,ay as W,a as A}from"./index-DOhcCDks.js";import{F as M}from"./ExclamationTriangleIcon-C1koK5ku.js";import{F as V}from"./LockClosedIcon-CMPSouVN.js";import{T as b,k as S,u as $}from"./ModalHeader-rFKqcgRs-D9hRST1o.js";import{r as H}from"./Subtitle-CV-2yKE4-BYmXrxOF.js";import{e as T}from"./Title-BnzYV3Is-BNN4oU9G.js";const D=A.div`
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
`,z={component:()=>{var p;let{user:i}=R(),{client:k,walletProxy:m,refreshSessionAndUser:C,closePrivyModal:l}=U(),s=P(),{entropyId:f,entropyIdVerifier:E}=((p=s.data)==null?void 0:p.recoverWallet)??{},[n,h]=u.useState(!1),[c,F]=u.useState(null),[d,g]=u.useState(null);function y(){var r,o,t,a;if(!n){if(d)return(o=(r=s.data)==null?void 0:r.setWalletPassword)==null||o.onFailure(d),void l();if(!c)return(a=(t=s.data)==null?void 0:t.setWalletPassword)==null||a.onFailure(Error("User exited set recovery flow")),void l()}}s.onUserCloseViaDialogOrKeybindRef.current=y;let I=!(!n&&!c);return e.jsxs(e.Fragment,d?{children:[e.jsx(b,{onClose:y},"header"),e.jsx(D,{$color:"var(--privy-color-error)",style:{alignSelf:"center"},children:e.jsx(M,{height:38,width:38,stroke:"var(--privy-color-error)"})}),e.jsx(T,{style:{marginTop:"0.5rem"},children:"Something went wrong"}),e.jsx(v,{style:{minHeight:"2rem"}}),e.jsx(S,{onClick:()=>g(null),children:"Try again"}),e.jsx($,{})]}:{children:[e.jsx(b,{onClose:y},"header"),e.jsx(V,{style:{width:"3rem",height:"3rem",alignSelf:"center"}}),e.jsx(T,{style:{marginTop:"0.5rem"},children:"Automatically secure your account"}),e.jsx(H,{style:{marginTop:"1rem"},children:"When you log into a new device, you’ll only need to authenticate to access your account. Never get logged out if you forget your password."}),e.jsx(v,{style:{minHeight:"2rem"}}),e.jsx(S,{loading:n,disabled:I,onClick:()=>async function(){h(!0);try{let r=await k.getAccessToken(),o=j(i,f);if(!r||!m||!o)return;if(!(await m.setRecovery({accessToken:r,entropyId:f,entropyIdVerifier:E,existingRecoveryMethod:o.recoveryMethod,recoveryMethod:"privy"})).entropyId)throw Error("Unable to set recovery on wallet");let t=await C();if(!t)throw Error("Unable to set recovery on wallet");let a=j(t,o.address);if(!a)throw Error("Unabled to set recovery on wallet");F(!!t),setTimeout(()=>{var w,x;(x=(w=s.data)==null?void 0:w.setWalletPassword)==null||x.onSuccess(a),l()},W)}catch(r){g(r)}finally{h(!1)}}(),children:c?"Success":"Confirm"}),e.jsx($,{})]})}};export{z as SetAutomaticRecoveryScreen,z as default};
