import {useEffect,useRef,useState,type ComponentProps} from 'react'
import PocketCheckoutMethodChange from './PocketCheckoutMethodChange'
import PocketBottomSheet from './PocketBottomSheet'
import PocketCheckoutFields from './PocketCheckoutFields'
import PocketConfirmationDetails from './PocketConfirmationDetails'
import PocketFundingAction from './PocketFundingAction'
import PocketSlideAction from './PocketSlideAction'

type Props = ComponentProps<typeof PocketCheckoutFields> & {
  checkoutId?: string
  merchant: string
  paymentAmount: string
  rows: ComponentProps<typeof PocketConfirmationDetails>['rows']
  funding: Omit<ComponentProps<typeof PocketFundingAction>,'children'>
  error: string
  ready: boolean
  busy: boolean
  prepare: () => Promise<void>
  confirm: () => Promise<void>
  onClose: () => void
}
export default function PocketMerchantPaymentForm({checkoutId,merchant,paymentAmount,rows,funding,error,ready,busy,prepare,confirm,onClose,...fields}:Props){
 const [review,setReview]=useState(false),[preparing,setPreparing]=useState(false),[localError,setLocalError]=useState('')
 const [prepared,setPrepared]=useState(false)
 const lock=useRef(false)
 const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setPreparing(true);setLocalError('');try{await action()}catch(e){setLocalError(e instanceof Error?e.message:'Please try again.')}finally{lock.current=false;setPreparing(false)}}
 const prepareReview=async()=>{setPrepared(false);await prepare();setPrepared(true)}
 const waiting=preparing||(prepared&&!ready&&!error&&!localError&&!funding.asset)
 const disabled=busy||waiting
 useEffect(()=>{if(prepared&&ready&&!preparing){setReview(true)}},[prepared,ready,preparing])
 const valid=/^\d+(?:\.\d{1,6})?$/.test(fields.amount)&&Number(fields.amount)>0&&(!fields.requiresName||!!fields.name.trim())
 const message=localError||error
 return <PocketBottomSheet quietBackdrop title={review?'Confirm payment':'Pay '+merchant} showCloseButton dismissOnBackdrop={false} dismissible={!disabled} onClose={onClose} onBack={review?()=>{setReview(false);setPrepared(false)}:undefined}>
  {review?<PocketConfirmationDetails amount={paymentAmount} rows={rows}/>:<><h2 className="mb-5 text-center text-base font-semibold">{merchant}</h2><PocketCheckoutFields {...fields}/></>}
  {message&&!funding.asset&&<p role="alert" className="mt-4 text-center text-xs text-gray-500">{message}</p>}
  <div className="mt-5"><PocketFundingAction {...funding} locked={disabled||funding.locked}>
   {review?<>
    <PocketSlideAction plain approvalRequired={false} onPrepare={async()=>{}} disabled={disabled||!prepared||!ready} status={busy?'pending':'idle'} labels={{idle:'Confirm payment',disabled:preparing?'Preparing payment...':'Preparing payment',pending:'Processing'}} onConfirm={()=>void run(confirm)}/>
    {!disabled&&Boolean(message)&&<button type="button" className="mt-2 min-h-11 w-full text-xs font-semibold" onClick={()=>void run(prepareReview)}>Try again</button>}
   </>:<button type="button" className="pocket-cta-primary flex w-full items-center justify-center gap-2" aria-busy={disabled} disabled={disabled||!valid} onClick={()=>void run(prepareReview)}>{disabled&&<span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"/>}{disabled?'Preparing payment':'Continue'}</button>}
  </PocketFundingAction></div>
  {!review&&<PocketCheckoutMethodChange id={checkoutId} busy={disabled} onClose={onClose}/>}
 </PocketBottomSheet>
}
