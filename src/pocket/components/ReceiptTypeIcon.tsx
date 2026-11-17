import {receiptIconKind,receiptIconPaths,receiptTokenLogo} from '../../lib/receiptIdentity'
export function ReceiptTypeIcon({receipt,className='h-5 w-5'}:{receipt:Parameters<typeof receiptTokenLogo>[0];className?:string}){
 const logo=receiptTokenLogo(receipt)
 if(logo)return <img src={logo} alt="" aria-hidden="true" className={className+' rounded-full object-contain dark:invert'}/>
 const kind=receiptIconKind(receipt)
 return <svg viewBox="0 0 24 24" aria-hidden="true" className={className}><path d={receiptIconPaths[kind]} fill={kind==='wallet'?'currentColor':'none'} stroke={kind==='wallet'?'none':'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
