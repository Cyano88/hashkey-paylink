/** Merge only public state from the signed selection's exact child checkout. */
export function checkoutSelectionPublicResult(selection:any,child:any){
 if(!selection?.ok||!child?.ok||!selection.selectedCheckoutId||child.checkout?.id!==selection.selectedCheckoutId)throw Error('Checkout status could not be verified.')
 const status=child.checkout.status
 if(!['pending','processing','paid','failed','expired','refunded'].includes(status))throw Error('Checkout status could not be verified.')
 return {...selection,status,checkout:{...selection.checkout,status,canChange:selection.checkout.canChange&&status==='pending'}}
}
