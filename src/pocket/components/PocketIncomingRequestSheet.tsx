import PocketBottomSheet from './PocketBottomSheet'
export default function PocketIncomingRequestSheet({title,amount,sender,canDecline,busy,error,onPay,onDecline,onClose}:{title:string;amount:string;sender:string;canDecline:boolean;busy:boolean;error:string;onPay:()=>void;onDecline:()=>void;onClose:()=>void}) {
 return <PocketBottomSheet title="Payment request" onClose={onClose} dismissible={!busy} dismissOnBackdrop={false}>
  <h2 className="pr-10 text-base font-bold">{title}</h2>
  <p className="mt-4 text-2xl font-bold">{amount}</p>
  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">From {sender}</p>
  {error&&<p role="alert" className="mt-4 text-xs text-red-600 dark:text-red-400">{error}</p>}
  <div className={'mt-6 grid gap-3 '+(canDecline?'grid-cols-2':'grid-cols-1')}>
   {canDecline&&<button disabled={busy} onClick={onDecline} className="min-h-12 rounded-full border border-gray-200 text-sm font-semibold dark:border-[#262626]">Decline</button>}
   <button disabled={busy} onClick={onPay} className="pocket-cta-primary min-h-12">{busy?'Please wait?':'Pay'}</button>
  </div>
 </PocketBottomSheet>
}
