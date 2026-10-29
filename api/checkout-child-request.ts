import type {Request} from 'express'
// Node exposes headers through an inherited accessor; object spread loses them.
export function checkoutChildStatusRequest(req:Request,id:string) {
 return {...req,headers:req.headers,query:{...req.query,id}} as Request
}
