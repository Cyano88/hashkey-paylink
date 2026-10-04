import usePocketStockWallet from '../hooks/usePocketStockWallet'
import PocketXPay from './PocketXPay'
import PocketBottomSheet from './PocketBottomSheet'

/** Keep the existing XPay page mounted while its stock payment sheet is open. */
export default function PocketXPayNativeStockPayment({merchantId,checkoutId,onClose}:{merchantId:string;checkoutId:string;onClose:()=>void}){
 const wallet=usePocketStockWallet()
 if(!wallet.ready)return <PocketBottomSheet title="XPay" onClose={onClose} showCloseButton dismissOnBackdrop={false}><div role="status" aria-label="Preparing payment" className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"/></PocketBottomSheet>
 return <PocketXPay wallet={wallet} paymentContext={{merchantId,checkoutId,onClose}}/>
}
