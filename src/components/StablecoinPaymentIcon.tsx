import {useState} from 'react'
import {CircleStackIcon} from '@heroicons/react/24/outline'
const logos:Record<string,string>={USDC:'/brand/usdc-circle-logo.png',USDT:'/brand/usdt.svg',USDE:'/brand/usde.svg',USDG:'/brand/usdg.png',EURC:'/brand/eurc.png'}
/** Only show a token identity when a supported asset has actually been selected. */
export default function StablecoinPaymentIcon({asset,className='h-5 w-5'}:{asset?:string;className?:string}){
 const src=logos[(asset||'').trim().toUpperCase()]
 const [failed,setFailed]=useState<string|null>(null)
 return src&&failed!==src?<img src={src} alt="" aria-hidden="true" className={className+' shrink-0 rounded-full object-contain grayscale contrast-200 dark:invert'} onError={()=>setFailed(src)}/>:<CircleStackIcon aria-hidden="true" className={className}/>
}
