import{c as m}from"./createLucideIcon-CoNlzcbc.js";import{aU as o}from"./index-CMiE6Ukb.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],w=m("chevron-down",p),h=async({operation:i,until:l,delay:n,interval:c,attempts:e,signal:s})=>{let a,r;n&&await o(n);let t=0;for(;t<e;){if(s!=null&&s.aborted)return{status:"aborted",result:a,attempts:t,error:r};t++;try{if(r=void 0,a=await i(),l(a))return{status:"success",result:a,attempts:t};t<e&&await o(c)}catch(u){u instanceof Error&&(r=u),t<e&&await o(c)}}return{status:"max_attempts",result:a,attempts:t,error:r}};export{w as C,h as a};
