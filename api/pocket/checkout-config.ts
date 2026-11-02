import type { Request, Response } from 'express'
import {pocketStoreUrl} from '../../src/lib/pocketStoreUrl'
export default function handler(_req:Request,res:Response){
 const playStoreUrl=pocketStoreUrl(process.env.POCKET_PLAY_STORE_URL)
 res.setHeader('Cache-Control','public, max-age=300');return res.json({playStoreUrl})
}
