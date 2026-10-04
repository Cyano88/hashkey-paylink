import {useRef,useState,type ComponentProps} from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketCheckoutFields from './PocketCheckoutFields'
import PocketConfirmationDetails from './PocketConfirmationDetails'
import PocketFundingAction from './PocketFundingAction'
import PocketSlideAction from './PocketSlideAction'

type Props = ComponentProps<typeof PocketCheckoutFields> & {
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
export default function PocketMerchantPaymentForm({merchant,paymentAmount,rows,funding,error,ready,busy,prepare,confirm,onClose,...fields}:Props){
 const [review,setReview]=useState(false),[preparing,setPreparing]=useState(false),[localError,setLocalError]=useState('')
 const lock=useRef(false)
 const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setPreparing(true);setLocalError('');try{await action()}catch(e){setLocalError(e instanceof Error?e.message:'Please try again.')}finally{lock.current=false;setPreparing(false)}}
 const disabled=busy||preparing
 const valid=/^\d+(?:\.\d{1,6})?$/.test(fields.amount)&&Number(fields.amount)>0&&(!fields.requiresName||!!fields.name.trim())
 const message=localError||error
 return <PocketBottomSheet title={review?'Confirm payment':'Pay '+merchant} showCloseButton dismissOnBackdrop={false} dismissible={!disabled} onClose={()=>review?setReview(false):onClose()}>
  {review?<PocketConfirmationDetails amount={paymentAmount} rows={rows}/>:<><h2 className="mb-5 text-center text-base font-semibold">{merchant}</h2><PocketCheckoutFields {...fields}/></>}
  {message&&!funding.asset&&<p role="alert" className="mt-4 text-center text-xs text-gray-500">{message}</p>}
  <div className="mt-5"><PocketFundingAction {...funding} locked={disabled||funding.locked}>
   {review?<>
    <PocketSlideAction plain approvalRequired={false} onPrepare={async()=>{}} disabled={disabled||!ready} status={busy?'pending':'idle'} labels={{idle:'Confirm payment',disabled:preparing?'Preparing payment...':'Preparing payment',pending:'Processing'}} onConfirm={()=>void run(confirm)}/>
    {!disabled&&(message||!ready)&&<button type="button" className="mt-2 min-h-11 w-full text-xs font-semibold" onClick={()=>void run(prepare)}>Try again</button>}
   </>:<button type="button" className="pocket-cta-primary w-full" disabled={disabled||!valid} onClick={()=>{setReview(true);void run(prepare)}}>Continue</button>}
  </PocketFundingAction></div>
 </PocketBottomSheet>
}
