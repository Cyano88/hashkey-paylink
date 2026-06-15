import{dt as d,di as e,dj as r}from"./index-D3N6vbL1.js";import{$ as p}from"./ModalHeader-rFKqcgRs-DSFA_yib.js";import{e as f}from"./ErrorMessage-D8VaAP5m-DKKSnFeK.js";import{r as x}from"./LabelXs-oqZNqbm_-DBPpt6iJ.js";import{d as h}from"./Address-DYXDT9z1-BBkfoi7G.js";import{d as g}from"./shared-FM0rljBt-Dpx43L5L.js";import{C as j}from"./check-VlRK83RV.js";import{C as u}from"./copy-C9QkRf3I.js";let v=r(g)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,y=r.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,C=r.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,w=r.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,b=r(x)`
  text-align: left;
  margin-bottom: 0.5rem;
`,z=r(f)`
  margin-top: 0.25rem;
`,E=r(p)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`;const P=({errMsg:t,balance:s,address:a,className:c,title:n,showCopyButton:m=!1})=>{let[i,l]=d.useState(!1);return d.useEffect(()=>{if(i){let o=setTimeout(()=>l(!1),3e3);return()=>clearTimeout(o)}},[i]),e.jsxs("div",{children:[n&&e.jsx(b,{children:n}),e.jsx(v,{className:c,$state:t?"error":void 0,children:e.jsxs(y,{children:[e.jsxs(C,{children:[e.jsx(h,{address:a,showCopyIcon:!1}),s!==void 0&&e.jsx(w,{children:s})]}),m&&e.jsx(E,{onClick:function(o){o.stopPropagation(),navigator.clipboard.writeText(a).then(()=>l(!0)).catch(console.error)},size:"sm",children:e.jsxs(e.Fragment,i?{children:["Copied",e.jsx(j,{size:14})]}:{children:["Copy",e.jsx(u,{size:14})]})})]})}),t&&e.jsx(z,{children:t})]})};export{P as j};
