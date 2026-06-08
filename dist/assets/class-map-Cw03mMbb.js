import{a as h,u,A as l,E as d}from"./lit-element-B_1eSxYJ.js";/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const p={attribute:!0,type:String,converter:u,reflect:!1,hasChanged:h},f=(t=p,e,r)=>{const{kind:n,metadata:o}=r;let s=globalThis.litPropertyMetadata.get(o);if(s===void 0&&globalThis.litPropertyMetadata.set(o,s=new Map),n==="setter"&&((t=Object.create(t)).wrapped=!0),s.set(r.name,t),n==="accessor"){const{name:i}=r;return{set(a){const c=e.get.call(this);e.set.call(this,a),this.requestUpdate(i,c,t,!0,a)},init(a){return a!==void 0&&this.C(i,void 0,t,a),a}}}if(n==="setter"){const{name:i}=r;return function(a){const c=this[i];e.call(this,a),this.requestUpdate(i,c,t,!0,a)}}throw Error("Unsupported decorator location: "+n)};function b(t){return(e,r)=>typeof r=="object"?f(t,e,r):((n,o,s)=>{const i=o.hasOwnProperty(s);return o.constructor.createProperty(s,n),i?Object.getOwnPropertyDescriptor(o,s):void 0})(t,e,r)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function $(t){return b({...t,state:!0,attribute:!1})}/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const A=t=>t??l;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const g={ATTRIBUTE:1,CHILD:2},m=t=>(...e)=>({_$litDirective$:t,values:e});class v{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,r,n){this._$Ct=e,this._$AM=r,this._$Ci=n}_$AS(e,r){return this.update(e,r)}update(e,r){return this.render(...r)}}/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const T=m(class extends v{constructor(t){var e;if(super(t),t.type!==g.ATTRIBUTE||t.name!=="class"||((e=t.strings)==null?void 0:e.length)>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(t){return" "+Object.keys(t).filter(e=>t[e]).join(" ")+" "}update(t,[e]){var n,o;if(this.st===void 0){this.st=new Set,t.strings!==void 0&&(this.nt=new Set(t.strings.join(" ").split(/\s/).filter(s=>s!=="")));for(const s in e)e[s]&&!((n=this.nt)!=null&&n.has(s))&&this.st.add(s);return this.render(e)}const r=t.element.classList;for(const s of this.st)s in e||(r.remove(s),this.st.delete(s));for(const s in e){const i=!!e[s];i===this.st.has(s)||(o=this.nt)!=null&&o.has(s)||(i?(r.add(s),this.st.add(s)):(r.remove(s),this.st.delete(s)))}return d}});export{T as a,m as e,v as i,b as n,A as o,$ as r,g as t};
