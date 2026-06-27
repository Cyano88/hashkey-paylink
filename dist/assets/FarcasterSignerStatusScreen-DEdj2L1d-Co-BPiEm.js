import{dh as F,di as I,dk as T,dm as d,dJ as k,dj as t,dL as y,e9 as O,dG as _,dF as n}from"./index-DTiRMXvZ.js";import{h as q}from"./CopyToClipboard-DSTf_eKU-DZAYFim6.js";import{n as B}from"./OpenLink-DZHy38vr-DrYl68R-.js";import{C as A}from"./QrCode-cBrqXGmp-CQil7Aiq.js";import{n as E}from"./ScreenLayout-Dmp7r6fS-C_gTQSre.js";import{l as h}from"./farcaster-DPlSjvF5-KXnyZG_z.js";import"./browser-Bxlwbvq2.js";import"./ModalHeader-rFKqcgRs-C115Rdx5.js";import"./Screen-DXLhhfU3-BrldKQv9.js";import"./index-Dq_xe9dz-DLZn-M3O.js";let S="#8a63d2";const L=({appName:u,loading:m,success:i,errorMessage:e,connectUri:r,onBack:s,onClose:c,onOpenFarcaster:o})=>t.jsx(E,y||m?O?{title:e?e.message:"Add a signer to Farcaster",subtitle:e?e.detail:`This will allow ${u} to add casts, likes, follows, and more on your behalf.`,icon:h,iconVariant:"loading",iconLoadingStatus:{success:i,fail:!!e},primaryCta:r&&o?{label:"Open Farcaster app",onClick:o}:void 0,onBack:s,onClose:c,watermark:!0}:{title:e?e.message:"Requesting signer from Farcaster",subtitle:e?e.detail:"This should only take a moment",icon:h,iconVariant:"loading",iconLoadingStatus:{success:i,fail:!!e},onBack:s,onClose:c,watermark:!0,children:r&&y&&t.jsx(M,{children:t.jsx(B,{text:"Take me to Farcaster",url:r,color:S})})}:{title:"Add a signer to Farcaster",subtitle:`This will allow ${u} to add casts, likes, follows, and more on your behalf.`,onBack:s,onClose:c,watermark:!0,children:t.jsxs(R,{children:[t.jsx(N,{children:r?t.jsx(A,{url:r,size:275,squareLogoElement:h}):t.jsx(z,{children:t.jsx(_,{})})}),t.jsxs(P,{children:[t.jsx(V,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),r&&t.jsx(q,{text:r,itemName:"link",color:S})]})]})});let M=n.div`
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
`;const Z={component:()=>{let{lastScreen:u,navigateBack:m,data:i}=F(),e=I(),{requestFarcasterSignerStatus:r,closePrivyModal:s}=T(),[c,o]=d.useState(void 0),[j,x]=d.useState(!1),[w,v]=d.useState(!1),g=d.useRef([]),a=i==null?void 0:i.farcasterSigner;d.useEffect(()=>{let C=Date.now(),l=setInterval(async()=>{if(!(a!=null&&a.public_key))return clearInterval(l),void o({retryable:!0,message:"Connect failed",detail:"Something went wrong. Please try again."});a.status==="approved"&&(clearInterval(l),x(!1),v(!0),g.current.push(setTimeout(()=>s({shouldCallAuthOnSuccess:!1,isSuccess:!0}),k)));let p=await r(a==null?void 0:a.public_key),b=Date.now()-C;p.status==="approved"?(clearInterval(l),x(!1),v(!0),g.current.push(setTimeout(()=>s({shouldCallAuthOnSuccess:!1,isSuccess:!0}),k))):b>3e5?(clearInterval(l),o({retryable:!0,message:"Connect failed",detail:"The request timed out. Try again."})):p.status==="revoked"&&(clearInterval(l),o({retryable:!0,message:"Request rejected",detail:"The request was rejected. Please try again."}))},2e3);return()=>{clearInterval(l),g.current.forEach(p=>clearTimeout(p))}},[]);let f=(a==null?void 0:a.status)==="pending_approval"?a.signer_approval_url:void 0;return t.jsx(L,{appName:e.name,loading:j,success:w,errorMessage:c,connectUri:f,onBack:u?m:void 0,onClose:s,onOpenFarcaster:()=>{f&&(window.location.href=f)}})}};export{Z as FarcasterSignerStatusScreen,L as FarcasterSignerStatusView,Z as default};
