const KEY='pocket:checkout-pin-reset:v1'
type ResetContext={email:string;path:string;expiresAt:number}
export function saveCheckoutPinReset(context:ResetContext){sessionStorage.setItem(KEY,JSON.stringify(context))}
export function clearCheckoutPinReset(){sessionStorage.removeItem(KEY)}
export function readCheckoutPinReset(path:string):ResetContext|null{
 try{const value=JSON.parse(sessionStorage.getItem(KEY)||'null');return value&&value.path===path&&typeof value.email==='string'&&/^\S+@\S+\.\S+$/.test(value.email)&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>Date.now()?value:null}catch{return null}
}
