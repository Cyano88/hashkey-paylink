// Share identical concurrent observations without serving stale settlement state.
const active=new Map<string,Promise<unknown>>()
export async function singleGiftObservation<T>(key:string,read:()=>Promise<T>):Promise<T>{
 const existing=active.get(key);if(existing)return existing as Promise<T>
 const result=read();active.set(key,result)
 try{return await result}finally{if(active.get(key)===result)active.delete(key)}
}
