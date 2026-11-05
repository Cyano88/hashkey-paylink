/** Shared customer-visible result. Durable settlement/recovery state stays separate. */
export function pocketBridgeResultPresentation(input:{state:string;txHash?:string;sourceConfirmed?:boolean;deliveryObserved?:boolean;deliveryConfirmed?:boolean}){
 const terminal=['completed','failed','refunded','cancelled','not_submitted','needs_attention','needs_review'].includes(input.state)
 const handoffSuccess=!terminal&&Boolean(input.txHash)&&Boolean(input.sourceConfirmed||input.deliveryObserved||input.deliveryConfirmed)
 return {terminal,handoffSuccess,activityState:handoffSuccess?'completed':input.state}
}
