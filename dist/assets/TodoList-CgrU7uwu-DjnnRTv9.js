import{dF as o,dj as t,ea as n}from"./index-_nJyQP54.js";import{c as a}from"./createLucideIcon-CV-No36b.js";import{C as c}from"./check-hFIUcBzs.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]],d=a("x",l),h=o.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px; /* 10px gap between items */
  padding-left: 8px; /* 8px indentation container */
`;o.div`
  &&& {
    margin-left: 6px; /* Center the line under the checkbox (12px/2) */
    border-left: 2px solid var(--privy-color-foreground-4);
    height: 10px; /* 10px H padding between paragraphs */
    margin-top: 0;
    margin-bottom: 0;
  }
`;const g=({children:i,variant:e="default",icon:r})=>{let s=()=>{switch(e){case"success":return"var(--privy-color-icon-success)";case"error":return"var(--privy-color-icon-error)";default:return"var(--privy-color-icon-muted)"}};return t.jsxs(u,{children:[t.jsx(p,{$variant:e,"data-variant":e,children:(()=>{if(r)return n.isValidElement(r)?n.cloneElement(r,{stroke:s(),strokeWidth:2}):r;switch(e){case"success":default:return t.jsx(c,{size:12,stroke:s(),strokeWidth:3});case"error":return t.jsx(d,{size:12,stroke:s(),strokeWidth:3})}})()}),i]})};let p=o.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: ${({$variant:i})=>{switch(i){case"success":return"var(--privy-color-success-bg, #EAFCEF)";case"error":return"var(--privy-color-error-bg, #FEE2E2)";default:return"var(--privy-color-background-2)"}}};
  flex-shrink: 0;
`,u=o.div`
  display: flex;
  justify-content: flex-start;
  align-items: flex-start; /* Align all elements to the top */
  text-align: left;
  gap: 8px;

  && {
    a {
      color: var(--privy-color-accent);
    }
  }
`;export{h as a,g as c};
