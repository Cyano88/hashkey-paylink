import {Capacitor,registerPlugin} from '@capacitor/core'
const nativeFiles=registerPlugin<{saveSupportFile(options:{name:string;mimeType:string;base64:string}):Promise<{cancelled?:boolean}>}>('PocketStatement')
export async function downloadSupportFile(blob:Blob,name:string){
 if(Capacitor.getPlatform()==='android'){
  const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(Error('File could not be prepared.'));reader.readAsDataURL(blob)})
  await nativeFiles.saveSupportFile({name,mimeType:blob.type.split(';')[0],base64});return
 }
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
