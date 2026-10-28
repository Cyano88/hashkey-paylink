import {useEffect,useState} from 'react'
export default function CheckoutMerchant({name,logo}:{name:string;logo?:string}){
 const [failed,setFailed]=useState(false)
 useEffect(()=>setFailed(false),[logo])
 const usable=Boolean(logo&&/^https:\/\//i.test(logo)&&logo.length<=400&&!failed)
 return <div className="text-center">{usable&&<img src={logo} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="mx-auto mb-3 h-10 max-w-full w-auto object-contain"/>}<p className="text-sm font-medium">{name}</p></div>
}
