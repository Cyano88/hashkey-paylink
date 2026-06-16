import{dt as p,di as e,dj as l}from"./index-DErdTaO0.js";import{C as m}from"./check-Bsq788xt.js";import{C as f}from"./copy-BuFZj6NU.js";let a=l.button`
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 0.5rem;

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`,h=l.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--privy-color-foreground-2);
`,x=l(m)`
  color: var(--privy-color-icon-success);
  flex-shrink: 0;
`,u=l(f)`
  color: var(--privy-color-icon-muted);
  flex-shrink: 0;
`;function y({children:r,iconOnly:c,value:o,hideCopyIcon:t,iconSize:i=14,...s}){let[n,d]=p.useState(!1);return e.jsxs(a,{...s,onClick:()=>{navigator.clipboard.writeText(o||(typeof r=="string"?r:"")).catch(console.error),d(!0),setTimeout(()=>d(!1),1500)},children:[r," ",n?e.jsxs(h,{children:[e.jsx(x,{size:i})," ",!c&&"Copied"]}):!t&&e.jsx(u,{size:i})]})}const C=({value:r,includeChildren:c,children:o,...t})=>{let[i,s]=p.useState(!1),n=()=>{navigator.clipboard.writeText(r).catch(console.error),s(!0),setTimeout(()=>s(!1),1500)};return e.jsxs(e.Fragment,{children:[c?e.jsx(a,{...t,onClick:n,children:o}):e.jsx(e.Fragment,{children:o}),e.jsx(a,{...t,onClick:n,children:i?e.jsx(h,{children:e.jsx(x,{})}):e.jsx(u,{})})]})};export{y as m,C as p};
