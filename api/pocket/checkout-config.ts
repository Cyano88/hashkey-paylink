import type { Request, Response } from 'express'
export default function handler(_req:Request,res:Response){
 let playStoreUrl=''
 try{const u=new URL(process.env.POCKET_PLAY_STORE_URL||'');if(u.origin==='https://play.google.com'&&u.pathname==='/store/apps/details'&&u.searchParams.get('id')==='com.hashpaylink.pocket'&&!u.username&&!u.password)playStoreUrl=u.href}catch{}
 res.setHeader('Cache-Control','public, max-age=300');return res.json({playStoreUrl})
}
