import type {ReactNode} from 'react'
import {moneyParts} from '../lib/moneyPresentation'
/** Currency and amount inherit the same money font; only size and weight differ. */
export function MoneyText({children}:{children:ReactNode}){
 if(typeof children!=='string')return <>{children}</>
 return <span className="tabular-nums" style={{fontFamily:'inherit'}}>{moneyParts(children).map((part,index)=>part.currency?<span key={index} data-money-code style={{fontFamily:'inherit',fontSize:'max(10px, 0.72em)',fontWeight:500,letterSpacing:'normal'}}>{part.text}</span>:<span key={index}>{part.text}</span>)}</span>
}
export function MoneyAmount({amount,currency}:{amount:string|number;currency:string}){
 return <span className="tabular-nums" style={{fontFamily:'inherit'}}><span data-money-code style={{fontFamily:'inherit',fontSize:'max(10px, 0.72em)',fontWeight:500,letterSpacing:'normal'}}>{currency}</span>{' '}<span>{amount}</span></span>
}
