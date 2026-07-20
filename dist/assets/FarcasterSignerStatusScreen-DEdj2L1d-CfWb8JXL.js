import{g as F,l as I,I as T,r as u,ax as y,j as a,aA as k,bl as O,aL as _,a as n}from"./index-DISheC2s.js";import{h as q}from"./CopyToClipboard-DSTf_eKU-DXx6JPhH.js";import{n as A}from"./OpenLink-DZHy38vr-B69AcqbF.js";import{C as B}from"./QrCode-cBrqXGmp-B2QD0v8e.js";import{n as E}from"./ScreenLayout-Dmp7r6fS-Bx9b1J_2.js";import{l as x}from"./farcaster-DPlSjvF5-Vd8452sm.js";import"./browser-Bxlwbvq2.js";import"./ModalHeader-rFKqcgRs-DxFA-DKI.js";import"./Screen-DXLhhfU3-DKIuZnS2.js";import"./index-Dq_xe9dz-C7zgYy28.js";let S="#8a63d2";const L=({appName:d,loading:m,success:i,errorMessage:e,connectUri:r,onBack:s,onClose:c,onOpenFarcaster:o})=>a.jsx(E,k||m?O?{title:e?e.message:"Add a signer to Farcaster",subtitle:e?e.detail:`This will allow ${d} to add casts, likes, follows, and more on your behalf.`,icon:x,iconVariant:"loading",iconLoadingStatus:{success:i,fail:!!e},primaryCta:r&&o?{label:"Open Farcaster app",onClick:o}:void 0,onBack:s,onClose:c,watermark:!0}:{title:e?e.message:"Requesting signer from Farcaster",subtitle:e?e.detail:"This should only take a moment",icon:x,iconVariant:"loading",iconLoadingStatus:{success:i,fail:!!e},onBack:s,onClose:c,watermark:!0,children:r&&k&&a.jsx(M,{children:a.jsx(A,{text:"Take me to Farcaster",url:r,color:S})})}:{title:"Add a signer to Farcaster",subtitle:`This will allow ${d} to add casts, likes, follows, and more on your behalf.`,onBack:s,onClose:c,watermark:!0,children:a.jsxs(R,{children:[a.jsx(N,{children:r?a.jsx(B,{url:r,size:275,squareLogoElement:x}):a.jsx(z,{children:a.jsx(_,{})})}),a.jsxs(P,{children:[a.jsx(V,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),r&&a.jsx(q,{text:r,itemName:"link",color:S})]})]})});let M=n.div`
  margin-top: 24px;
`,R=n.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,N=n.div`
  padding: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,P=n.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,V=n.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,z=n.div`
  position: relative;
  width: 82px;
  height: 82px;
`;const Z={component:()=>{let{lastScreen:d,navigateBack:m,data:i}=F(),e=I(),{requestFarcasterSignerStatus:r,closePrivyModal:s}=T(),[c,o]=u.useState(void 0),[j,h]=u.useState(!1),[w,v]=u.useState(!1),g=u.useRef([]),t=i==null?void 0:i.farcasterSigner;u.useEffect(()=>{let b=Date.now(),l=setInterval(async()=>{if(!(t!=null&&t.public_key))return clearInterval(l),void o({retryable:!0,message:"Connect failed",detail:"Something went wrong. Please try again."});t.status==="approved"&&(clearInterval(l),h(!1),v(!0),g.current.push(setTimeout(()=>s({shouldCallAuthOnSuccess:!1,isSuccess:!0}),y)));let p=await r(t==null?void 0:t.public_key),C=Date.now()-b;p.status==="approved"?(clearInterval(l),h(!1),v(!0),g.current.push(setTimeout(()=>s({shouldCallAuthOnSuccess:!1,isSuccess:!0}),y))):C>3e5?(clearInterval(l),o({retryable:!0,message:"Connect failed",detail:"The request timed out. Try again."})):p.status==="revoked"&&(clearInterval(l),o({retryable:!0,message:"Request rejected",detail:"The request was rejected. Please try again."}))},2e3);return()=>{clearInterval(l),g.current.forEach(p=>clearTimeout(p))}},[]);let f=(t==null?void 0:t.status)==="pending_approval"?t.signer_approval_url:void 0;return a.jsx(L,{appName:e.name,loading:j,success:w,errorMessage:c,connectUri:f,onBack:d?m:void 0,onClose:s,onOpenFarcaster:()=>{f&&(window.location.href=f)}})}};export{Z as FarcasterSignerStatusScreen,L as FarcasterSignerStatusView,Z as default};
