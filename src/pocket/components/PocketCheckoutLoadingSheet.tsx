import PocketBottomSheet from './PocketBottomSheet'
export default function PocketCheckoutLoadingSheet({onClose,error,onRetry}:{onClose:()=>void;error?:string;onRetry?:()=>void}){
 return <PocketBottomSheet quietBackdrop title="Payment checkout" onClose={onClose} showCloseButton dismissOnBackdrop={false}>
  {error?<div className="py-4"><p role="alert" className="text-center text-sm text-gray-500">{error}</p><button type="button" className="pocket-cta-primary mt-5 w-full" onClick={onRetry||onClose}>{onRetry?'Try again':'Return to Pocket'}</button></div>:<div aria-label="Loading payment details" aria-busy="true" className="space-y-5 pb-2 pt-3"><div aria-hidden="true" className="mx-auto h-5 w-28 rounded bg-gray-100 dark:bg-white/10"/><div aria-hidden="true" className="h-14 rounded-xl bg-gray-100 dark:bg-white/10"/><div aria-hidden="true" className="h-14 rounded-xl bg-gray-100 dark:bg-white/10"/><button disabled type="button" aria-label="Preparing payment" className="pocket-cta-primary flex w-full items-center justify-center"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"/></button></div>}
 </PocketBottomSheet>
}
