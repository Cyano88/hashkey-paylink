import reviewed from './pocketStockGiftDeployment.json'
import type {Address,Hex} from 'viem'
import type {MultiGiftAsset} from '../features/gifts/pocketMultiGift'
export type StockGiftDeployment={escrow:Address;runtimeHash:Hex;treasury:Address;authority:Address;deploymentBlock:string;confirmations:number;asset:MultiGiftAsset}
// Reviewed, deployed X Layer contracts only. Shared by server validation and wallet validation.
export const STOCK_GIFT_DEPLOYMENTS:readonly StockGiftDeployment[]=Object.freeze(reviewed.assets.map(asset=>({escrow:reviewed.escrow as Address,runtimeHash:reviewed.runtimeHash as Hex,treasury:reviewed.treasury as Address,authority:reviewed.authority as Address,deploymentBlock:reviewed.deploymentBlock,confirmations:reviewed.confirmations,asset:{...asset,token:asset.token as Address,rail:'xstocks' as const}})))
