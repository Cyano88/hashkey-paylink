import{k as F,I,g as P,r as u,j as e,bU as v,cR as j,ax as W,a as A}from"./index-Pd3Un10Z.js";import{F as M}from"./ExclamationTriangleIcon-BmupREyA.js";import{F as V}from"./LockClosedIcon-XqOKhBho.js";import{T as b,k as S,u as $}from"./ModalHeader-rFKqcgRs-E0BzJ5DM.js";import{r as H}from"./Subtitle-CV-2yKE4-Dw55M8Zk.js";import{e as k}from"./Title-BnzYV3Is-DhD_33zj.js";const D=A.div`
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
`,B={component:()=>{var p;let{user:i}=F(),{client:T,walletProxy:m,refreshSessionAndUser:R,closePrivyModal:l}=I(),s=P(),{entropyId:f,entropyIdVerifier:U}=((p=s.data)==null?void 0:p.recoverWallet)??{},[n,h]=u.useState(!1),[c,C]=u.useState(null),[d,g]=u.useState(null);function y(){var r,o,t,a;if(!n){if(d)return(o=(r=s.data)==null?void 0:r.setWalletPassword)==null||o.onFailure(d),void l();if(!c)return(a=(t=s.data)==null?void 0:t.setWalletPassword)==null||a.onFailure(Error("User exited set recovery flow")),void l()}}s.onUserCloseViaDialogOrKeybindRef.current=y;let E=!(!n&&!c);return e.jsxs(e.Fragment,d?{children:[e.jsx(b,{onClose:y},"header"),e.jsx(D,{$color:"var(--privy-color-error)",style:{alignSelf:"center"},children:e.jsx(M,{height:38,width:38,stroke:"var(--privy-color-error)"})}),e.jsx(k,{style:{marginTop:"0.5rem"},children:"Something went wrong"}),e.jsx(v,{style:{minHeight:"2rem"}}),e.jsx(S,{onClick:()=>g(null),children:"Try again"}),e.jsx($,{})]}:{children:[e.jsx(b,{onClose:y},"header"),e.jsx(V,{style:{width:"3rem",height:"3rem",alignSelf:"center"}}),e.jsx(k,{style:{marginTop:"0.5rem"},children:"Automatically secure your account"}),e.jsx(H,{style:{marginTop:"1rem"},children:"When you log into a new device, you’ll only need to authenticate to access your account. Never get logged out if you forget your password."}),e.jsx(v,{style:{minHeight:"2rem"}}),e.jsx(S,{loading:n,disabled:E,onClick:()=>async function(){h(!0);try{let r=await T.getAccessToken(),o=j(i,f);if(!r||!m||!o)return;if(!(await m.setRecovery({accessToken:r,entropyId:f,entropyIdVerifier:U,existingRecoveryMethod:o.recoveryMethod,recoveryMethod:"privy"})).entropyId)throw Error("Unable to set recovery on wallet");let t=await R();if(!t)throw Error("Unable to set recovery on wallet");let a=j(t,o.address);if(!a)throw Error("Unabled to set recovery on wallet");C(!!t),setTimeout(()=>{var x,w;(w=(x=s.data)==null?void 0:x.setWalletPassword)==null||w.onSuccess(a),l()},W)}catch(r){g(r)}finally{h(!1)}}(),children:c?"Success":"Confirm"}),e.jsx($,{})]})}};export{B as SetAutomaticRecoveryScreen,B as default};
