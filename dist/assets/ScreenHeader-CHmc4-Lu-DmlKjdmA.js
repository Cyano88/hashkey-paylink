import{di as i,dj as o}from"./index-CkptrDAQ.js";const c=({title:r,description:t,children:n,...e})=>i.jsx(l,{...e,children:i.jsxs(i.Fragment,{children:[i.jsx("h3",{children:r}),typeof t=="string"?i.jsx("p",{children:t}):t,n]})});o(c)`
  margin-bottom: 24px;
`;const x=({title:r,description:t,icon:n,children:e,...s})=>i.jsxs(a,{...s,children:[n||null,i.jsx("h3",{children:r}),t&&typeof t=="string"?i.jsx("p",{children:t}):t,e]});let l=o.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
  width: 100%;
  margin-bottom: 24px;

  && h3 {
    font-size: 17px;
    color: var(--privy-color-foreground);
  }

  /* Sugar assuming children are paragraphs. Otherwise, handling styling on your own */
  && p {
    color: var(--privy-color-foreground-2);
    font-size: 14px;
  }
`,a=o(l)`
  align-items: center;
  text-align: center;
  gap: 16px;

  h3 {
    margin-bottom: 24px;
  }
`;export{c as n,x as o};
