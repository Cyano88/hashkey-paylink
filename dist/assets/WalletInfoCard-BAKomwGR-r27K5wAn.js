import{r as c,j as e,a as r}from"./index-wScOVN6z.js";import{$ as p}from"./ModalHeader-rFKqcgRs-CJFIC2qZ.js";import{e as f}from"./ErrorMessage-D8VaAP5m-DZoufKoZ.js";import{r as x}from"./LabelXs-oqZNqbm_-BlGB8mqw.js";import{d as h}from"./Address-DYXDT9z1-Dy54dmny.js";import{d as g}from"./shared-FM0rljBt-BkDD5aXX.js";import{C as j}from"./check-B2hHX9mx.js";import{C as u}from"./copy-C8e_UhP6.js";let v=r(g)`
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
`;const P=({errMsg:t,balance:i,address:a,className:d,title:n,showCopyButton:m=!1})=>{let[o,l]=c.useState(!1);return c.useEffect(()=>{if(o){let s=setTimeout(()=>l(!1),3e3);return()=>clearTimeout(s)}},[o]),e.jsxs("div",{children:[n&&e.jsx(b,{children:n}),e.jsx(v,{className:d,$state:t?"error":void 0,children:e.jsxs(y,{children:[e.jsxs(C,{children:[e.jsx(h,{address:a,showCopyIcon:!1}),i!==void 0&&e.jsx(w,{children:i})]}),m&&e.jsx(E,{onClick:function(s){s.stopPropagation(),navigator.clipboard.writeText(a).then(()=>l(!0)).catch(console.error)},size:"sm",children:e.jsxs(e.Fragment,o?{children:["Copied",e.jsx(j,{size:14})]}:{children:["Copy",e.jsx(u,{size:14})]})})]})}),t&&e.jsx(z,{children:t})]})};export{P as j};
