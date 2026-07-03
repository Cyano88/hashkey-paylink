import{a as n,k as L,bL as P,I as N,g as A,r as m,j as e,i as b,E as g,bo as I,bn as S}from"./index-Dwt0oB4w.js";import{a as M,c as v}from"./TodoList-CgrU7uwu-C2jQ28kk.js";import{n as j}from"./ScreenLayout-Dmp7r6fS-DTuQqHK_.js";import{C as $}from"./circle-check-big-mzonQd8G.js";import{F as C}from"./fingerprint-pattern-CB2WtyE3.js";import{c as z}from"./createLucideIcon-D1LHMrzj.js";import"./check-6Y4MYvbi.js";import"./ModalHeader-rFKqcgRs-CT1ulyRH.js";import"./Screen-DXLhhfU3-B1GEI49Z.js";import"./index-Dq_xe9dz-xQ1Gspar.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],W=z("trash-2",U),B=({passkeys:i,name:l,isLoading:u,errorReason:y,success:o,expanded:a,onLinkPasskey:f,onUnlinkPasskey:t,onExpand:r,onBack:s,onClose:c})=>o?e.jsx(j,{title:"Passkeys updated",icon:$,iconVariant:"success",primaryCta:{label:"Done",onClick:c},onClose:c,watermark:!0}):a?e.jsx(j,{icon:C,title:"Your passkeys",onBack:s,onClose:c,watermark:!0,children:e.jsx(E,{passkeys:i,expanded:a,onUnlink:t,onExpand:r})}):e.jsxs(j,{icon:C,title:"Set up passkey verification",subtitle:"Verify with passkey",primaryCta:{label:"Add new passkey",onClick:f,loading:u},onClose:c,watermark:!0,helpText:y||void 0,children:[i.length===0?e.jsx(O,{}):e.jsx(T,{children:e.jsx(E,{passkeys:i,expanded:a,onUnlink:t,onExpand:r})}),l?e.jsxs(_,{children:[e.jsx(V,{children:"New Passkey Name"}),e.jsx(D,{children:l})]}):null]});let T=n.div`
  margin-bottom: 0.75rem;
`,_=n.div`
  margin-top: 0.25rem;
`,V=n.div`
  color: var(--privy-color-foreground-2);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,D=n.div`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  line-height: 1.25rem;
`,E=({passkeys:i,expanded:l,onUnlink:u,onExpand:y})=>{let[o,a]=m.useState([]),f=l?i.length:2;return e.jsxs("div",{children:[e.jsx(G,{children:"Your passkeys"}),e.jsxs(Y,{children:[i.slice(0,f).map(t=>{var s;return e.jsxs(H,{children:[e.jsxs("div",{children:[e.jsx(K,{children:(r=t,r.authenticatorName?r.createdWithBrowser?`${r.authenticatorName} on ${r.createdWithBrowser}`:r.authenticatorName:r.createdWithBrowser?r.createdWithOs?`${r.createdWithBrowser} on ${r.createdWithOs}`:`${r.createdWithBrowser}`:"Unknown device")}),e.jsxs(q,{children:["Last used:"," ",((s=t.latestVerifiedAt??t.firstVerifiedAt)==null?void 0:s.toLocaleString())??"N/A"]})]}),e.jsx(Q,{disabled:o.includes(t.credentialId),onClick:()=>(async c=>{a(d=>d.concat([c])),await u(c),a(d=>d.filter(k=>k!==c))})(t.credentialId),children:o.includes(t.credentialId)?e.jsx(S,{}):e.jsx(W,{size:16})})]},t.credentialId);var r}),i.length>2&&!l&&e.jsx(R,{onClick:y,children:"View all"})]})]})},O=()=>e.jsxs(M,{style:{color:"var(--privy-color-foreground)"},children:[e.jsx(v,{children:"Verify with Touch ID, Face ID, PIN, or hardware key"}),e.jsx(v,{children:"Takes seconds to set up and use"}),e.jsx(v,{children:"Use your passkey to verify transactions and login to your account"})]});const ce={component:()=>{var w;let{user:i}=L(),{unlink:l}=P(),{linkWithPasskey:u,closePrivyModal:y}=N(),{data:o}=A(),a=i==null?void 0:i.linkedAccounts.filter(p=>p.type==="passkey"),[f,t]=m.useState(!1),[r,s]=m.useState(""),[c,d]=m.useState(!1),[k,x]=m.useState(!1);return m.useEffect(()=>{a.length===0&&x(!1)},[a.length]),e.jsx(B,{passkeys:a,name:(w=o==null?void 0:o.passkeyAuthModalData)==null?void 0:w.name,isLoading:f,errorReason:r,success:c,expanded:k,onLinkPasskey:()=>{var p;t(!0),u({name:(p=o==null?void 0:o.passkeyAuthModalData)==null?void 0:p.name}).then(()=>d(!0)).catch(h=>{if(h instanceof b){if(h.privyErrorCode===g.CANNOT_LINK_MORE_OF_TYPE)return void s("Cannot link more passkeys to account.");if(h.privyErrorCode===g.PASSKEY_NOT_ALLOWED)return void s("Passkey request timed out or rejected by user.")}s("Unknown error occurred.")}).finally(()=>{t(!1)})},onUnlinkPasskey:async p=>(t(!0),await l({credentialId:p}).then(()=>d(!0)).catch(h=>{h instanceof b&&h.privyErrorCode===g.MISSING_MFA_CREDENTIALS?s("Cannot unlink a passkey enrolled in MFA"):s("Unknown error occurred.")}).finally(()=>{t(!1)})),onExpand:()=>x(!0),onBack:()=>x(!1),onClose:()=>y()})}},le=n.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 90px;
  border-radius: 50%;
  svg + svg {
    margin-left: 12px;
  }
  > svg {
    z-index: 2;
    color: var(--privy-color-accent) !important;
    stroke: var(--privy-color-accent) !important;
    fill: var(--privy-color-accent) !important;
  }
`;let F=I`
  && {
    width: 100%;
    font-size: 0.875rem;
    line-height: 1rem;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    justify-content: center;

    padding: 6px 8px;
    background-color: var(--privy-color-background);
    transition: background-color 200ms ease;
    color: var(--privy-color-accent) !important;

    :focus {
      outline: none;
      box-shadow: none;
    }
  }
`;const R=n.button`
  ${F}
`;let Y=n.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 0.5rem 0rem 0rem;
  flex-grow: 1;
  width: 100%;
`,G=n.div`
  line-height: 20px;
  height: 20px;
  font-size: 1em;
  font-weight: 450;
  display: flex;
  justify-content: flex-beginning;
  width: 100%;
`,K=n.div`
  font-size: 1em;
  line-height: 1.3em;
  font-weight: 500;
  color: var(--privy-color-foreground-2);
  padding: 0.2em 0;
`,q=n.div`
  font-size: 0.875rem;
  line-height: 1rem;
  color: #64668b;
  padding: 0.2em 0;
`,H=n.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1em;
  gap: 10px;
  font-size: 0.875rem;
  line-height: 1rem;
  text-align: left;
  border-radius: 8px;
  border: 1px solid #e2e3f0 !important;
  width: 100%;
  height: 5em;
`,J=I`
  :focus,
  :hover,
  :active {
    outline: none;
  }
  display: flex;
  width: 2em;
  height: 2em;
  justify-content: center;
  align-items: center;
  svg {
    color: var(--privy-color-error);
  }
  svg:hover {
    color: var(--privy-color-foreground-3);
  }
`,Q=n.button`
  ${J}
`;export{le as DoubleIconWrapper,R as LinkButton,ce as LinkPasskeyScreen,B as LinkPasskeyView,ce as default};
