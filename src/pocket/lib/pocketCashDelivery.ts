/** Customer-visible cash credit from the destination receipt matched by the server. */
export function pocketCashDelivery(q:{purpose?:string;rail?:string;destination?:string;destinationAsset?:string}, evidence:{txHash?:string;destinationTxHash?:string;amountOut?:string;deliveryObserved?:boolean;deliveryConfirmed?:boolean},state:string){
 if(q.purpose!=='cash'||q.rail!=='cross'||q.destination!=='base'||q.destinationAsset!=='USDC')return
 if(!['completed','pending','processing','submitted','source_confirmed','arriving'].includes(state))return
 if(!evidence.txHash||!evidence.destinationTxHash||!(state==='completed'||evidence.deliveryConfirmed||evidence.deliveryObserved))return
 const amount=evidence.amountOut
 return typeof amount==='string'&&/^\d+(?:\.\d+)?$/.test(amount)&&Number.isFinite(Number(amount))&&Number(amount)>0?amount:undefined
}
