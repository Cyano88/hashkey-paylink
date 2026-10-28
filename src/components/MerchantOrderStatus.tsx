export function merchantOrderCopy(status?:string) {
  switch(status) {
    case 'paid': return {title:'Your order is confirmed.',detail:'',action:'Back to menu'}
    case 'expired': return {title:'Checkout expired',detail:'Start a new checkout to place your order.',action:'Back to menu'}
    case 'processing': return {title:'Confirming your payment',detail:'Your payment is being verified. Do not pay again.',action:'Check payment status'}
    case 'failed': return {title:'Payment needs attention',detail:'We could not complete this payment. Check its status before paying again.',action:'Check payment status'}
    case 'pending': return {title:'Payment not completed',detail:'Return to checkout when you are ready to pay.',action:'Continue to checkout'}
    default: return {title:'Checking your order',detail:'',action:'Check payment status'}
  }
}
