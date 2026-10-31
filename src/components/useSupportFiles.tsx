import {useCallback,useEffect,useRef,useState} from 'react'
import {SUPPORT_FILE_COUNT,SUPPORT_FILE_LIMIT,type SupportAttachment} from '../lib/supportAttachments'
export type PendingSupportFile={key:string;file:File;preview?:string;uploaded?:SupportAttachment}
export function useSupportFiles(scope:string,query:string,getToken:()=>Promise<string|null>){
 const [drafts,setDrafts]=useState<Record<string,PendingSupportFile[]>>({}),[error,setError]=useState(''),[preview,setPreview]=useState<{url:string;name:string}|null>(null)
 const current=useRef(drafts);current.current=drafts;const urls=useRef(new Set<string>()),cache=useRef(new Map<string,SupportAttachment>())
 useEffect(()=>()=>{urls.current.forEach(URL.revokeObjectURL)},[])
 const files=drafts[scope]||[]
 function add(selected:FileList){
  const next=[...(current.current[scope]||[])];let issue=''
  for(const file of Array.from(selected)){
   if(next.length>=SUPPORT_FILE_COUNT){issue='Attach up to 3 files per message.';break}
   if(!file.size||file.size>SUPPORT_FILE_LIMIT){issue='Choose files up to 5 MB each.';continue}
   if(!/\.(png|jpe?g|webp|pdf|txt)$/i.test(file.name)){issue='Use PNG, JPG, WebP, PDF or plain-text files.';continue}
   const image=/\.(png|jpe?g|webp)$/i.test(file.name),url=image?URL.createObjectURL(file):undefined;if(url)urls.current.add(url)
   next.push({key:crypto.randomUUID(),file,preview:url})
  }
  setError(issue);setDrafts(rows=>({...rows,[scope]:next}))
 }
 function remove(key:string){const item=files.find(f=>f.key===key);if(item?.preview){URL.revokeObjectURL(item.preview);urls.current.delete(item.preview)}cache.current.delete(key);setDrafts(rows=>({...rows,[scope]:(rows[scope]||[]).filter(f=>f.key!==key)}))}
 function clear(){for(const item of files){if(item.preview){URL.revokeObjectURL(item.preview);urls.current.delete(item.preview)}cache.current.delete(item.key)}setDrafts(rows=>({...rows,[scope]:[]}));setError('')}
 async function upload(){
  const token=await getToken();if(!token)throw Error('Sign in to attach files.')
  const result:SupportAttachment[]=[]
  for(const f of files){
   let info=cache.current.get(f.key)
   if(!info){const ext=f.file.name.toLowerCase().split('.').pop();const mime=ext==='pdf'?'application/pdf':ext==='txt'?'text/plain':ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg'
    const r=await fetch('/api/support-files?'+query+'&name='+encodeURIComponent(f.file.name)+'&mime='+encodeURIComponent(mime),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/octet-stream'},body:f.file,signal:AbortSignal.timeout(30000)})
    const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'File could not be uploaded.');info=data.attachment;cache.current.set(f.key,info!)
   }
   result.push(info!)
  }
  return result
 }
 const open=useCallback(async(file:SupportAttachment,caseId:string)=>{
  try{setError('');const token=await getToken();if(!token)throw Error('Sign in to view files.');const params=new URLSearchParams(query);params.set('id',file.id);params.set('caseId',caseId)
   const r=await fetch('/api/support-files?'+params,{headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(30000)})
   if(!r.ok){const data=await r.json();throw Error(data.error||'File could not be loaded.')}
   const blob=await r.blob(),url=URL.createObjectURL(blob);urls.current.add(url)
   if(file.mime.startsWith('image/'))setPreview({url,name:file.name});else{const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url)},1000)}
  }catch(e){setError((e as Error).message)}
 },[query,getToken])
 const previewDialog=preview&&<div role="dialog" aria-label="Attachment preview" aria-modal="true" className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/80 p-5" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPreview(null)}}}><img src={preview.url} alt={preview.name} className="max-h-[75vh] max-w-full object-contain"/><div className="flex gap-5 text-sm text-white"><a href={preview.url} download={preview.name} className="underline">Download image</a><button type="button" autoFocus onClick={()=>setPreview(null)}>Close preview</button></div></div>
 return {files,add,remove,clear,upload,open,error,previewDialog}
}
