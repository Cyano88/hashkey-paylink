import{dj as e,eo as p,dm as d,dF as o}from"./index-DShn18Xi.js";import{n as j}from"./ScreenLayout-Dmp7r6fS-w9CsHH6v.js";import{C as k}from"./poll-CGBuN8pf-Dm31dj2D.js";const T=({currency:i="usd",value:a,onChange:n,inputMode:s="decimal",autoFocus:c})=>{var v;let[u,x]=d.useState("0"),h=d.useRef(null),f=a??u,m=((v=p[i])==null?void 0:v.symbol)??"$",b=d.useCallback(t=>{let r=t.target.value,l=(r=r.replace(/[^\d.]/g,"")).split(".");l.length>2&&(r=l[0]+"."+l.slice(1).join("")),l.length===2&&l[1].length>2&&(r=`${l[0]}.${l[1].slice(0,2)}`),r.length>1&&r[0]==="0"&&r[1]!=="."&&(r=r.slice(1)),(r===""||r===".")&&(r="0"),n?n(r):x(r)},[n]),w=d.useCallback(t=>{!(["Delete","Backspace","Tab","Escape","Enter",".","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(t.key)||(t.ctrlKey||t.metaKey)&&["a","c","v","x"].includes(t.key.toLowerCase()))&&(t.key>="0"&&t.key<="9"||t.preventDefault())},[]),g=d.useMemo(()=>(f.includes("."),f),[f]);return e.jsxs(C,{onClick:()=>{var t;return(t=h.current)==null?void 0:t.focus()},children:[e.jsx(y,{children:m}),g,e.jsx("input",{ref:h,type:"text",inputMode:s,value:g,onChange:b,onKeyDown:w,autoFocus:c,placeholder:"0",style:{width:1,height:"1rem",opacity:0,alignSelf:"center",fontSize:"1rem"}}),e.jsx(y,{style:{opacity:0},children:m})]})},q=({selectedAsset:i,onEditSourceAsset:a})=>{let{icon:n}=p[i];return e.jsxs(A,{onClick:a,children:[e.jsx(S,{children:n}),e.jsx(z,{children:i.toLocaleUpperCase()}),e.jsx(E,{children:e.jsx(k,{})})]})};let C=o.span`
  background-color: var(--privy-color-background);
  width: 100%;
  text-align: center;
  border: none;
  font-kerning: none;
  font-feature-settings: 'calt' off;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  cursor: pointer;

  &:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }

  && {
    color: var(--privy-color-foreground);
    font-size: 3.75rem;
    font-style: normal;
    font-weight: 600;
    line-height: 5.375rem;
  }
`,y=o.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: 1rem;
  font-style: normal;
  font-weight: 600;
  line-height: 1.5rem;
  margin-top: 0.75rem;
`,A=o.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: auto;
  gap: 0.5rem;
  border: 1px solid var(--privy-color-border-default);
  border-radius: var(--privy-border-radius-full);

  && {
    margin: auto;
    padding: 0.5rem 1rem;
  }
`,S=o.div`
  svg {
    width: 1rem;
    height: 1rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
    border: solid 0.1px var(--privy-color-border-default);
  }
`,z=o.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem;
`,E=o.div`
  color: var(--privy-color-foreground);

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;const G=({opts:i,isLoading:a,onSelectSource:n})=>e.jsx(j,{showClose:!1,showBack:!0,onBack:()=>n(i.source.selectedAsset),title:"Select currency",children:e.jsx(D,{children:i.source.assets.map(s=>{let{icon:c,name:u}=p[s];return e.jsx(L,{onClick:()=>n(s),disabled:a,children:e.jsxs(B,{children:[e.jsx(F,{children:c}),e.jsxs(K,{children:[e.jsx(M,{children:u}),e.jsx(R,{children:s.toLocaleUpperCase()})]})]})},s)})})});let D=o.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-height: 20.875rem;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`,L=o.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;

  && {
    padding: 0.75rem 1rem;
  }
`,B=o.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,F=o.div`
  svg {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
    border: solid 0.1px var(--privy-color-border-default);
  }
`,K=o.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
`,M=o.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
`,R=o.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.125rem;
`;export{T as c,q as p,G as y};
