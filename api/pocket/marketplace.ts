import type {Request,Response} from 'express'
/** Retired product: old clients must never dispatch another marketplace purchase.
 * Historical journal entries and receipts remain in their existing stores. */
export default function retiredMarketplace(_req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 return res.status(410).json({ok:false,code:'FEATURE_RETIRED',error:'The AI-service marketplace is no longer supported.'})
}
