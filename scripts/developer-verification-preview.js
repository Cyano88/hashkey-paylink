// Synthetic browser fixtures only. No provider calls or real identity documents.
const fixtureFetch=window.fetch;
let application=null;
let verification={status:'not_started',revision:0,required:true,documents:[]};
if(new URLSearchParams(location.search).has('verification')) projects[0].businessVerification=verification;
window.fetch=async(path,options={})=>{
 const url=new URL(String(path),location.origin);
 if(url.searchParams.get('resource')==='payments'){
  if(new URLSearchParams(location.search).has('activityFail'))return Response.json({ok:false,error:'Synthetic activity unavailable'},{status:503});
  const reference=url.searchParams.get('recordId');
  const payments=['paid','pending','expired','unknown'].map((status,i)=>({recordId:'pmf_example'+i,product:'funding',amount:'10',asset:'USDC',status,note:status==='paid'?'Account funded.':'Synthetic '+status,createdAt:new Date(Date.UTC(2026,9,27-i)).toISOString(),updatedAt:'2026-10-27T12:00:00Z',transactions:[],events:[]})).filter(p=>!reference||p.recordId===reference);
  return Response.json({ok:true,payments,nextCursor:null,coverage:'Synthetic payments'});
 }
 if(url.pathname==='/api/developer-verification/documents'){
  const slot=url.searchParams.get('slot');
  verification={...verification,status:'draft',revision:verification.revision+1,documents:[...verification.documents.filter(d=>d.slot!==slot),{id:crypto.randomUUID(),slot,name:options.body.name,mime:options.body.type,size:options.body.size,uploadedAt:new Date().toISOString(),sha256:'fixture'}]};
  return Response.json({ok:true,verification});
 }
 if(options.method==='POST'){
  const body=JSON.parse(options.body);
  if(body.action==='verification-read')return Response.json({ok:true,verification,application});
  if(['verification-save','verification-submit'].includes(body.action)){
   application=body.application;
   verification={...verification,revision:verification.revision+1,status:body.action==='verification-submit'?'submitted':'draft'};
   projects[0].businessVerification=verification;
   return Response.json({ok:true,verification});
  }
 }
 return fixtureFetch(path,options);
};
