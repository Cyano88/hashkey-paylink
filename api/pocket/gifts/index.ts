import {createPublicClient,http,type Address} from 'viem'
import {localCurrencyProfileRepository,verifiedPrivyUser} from '../../local-currency-profile.js'
import {circleLinkKey,readCircleLink} from '../../privy-circle-link.js'
import {durableGiftStore} from './store.js'
import {createGiftService} from './service.js'
import {createGiftHandler} from './handler.js'
import {observeGift} from './chain.js'
import {giftCircleChallenge} from './circle.js'
import {GiftError,type GiftDeployment,type GiftNetwork} from './types.js'
// Add only after reviewed deployment, bytecode/token/treasury verification and sponsorship testing.
// No env-only switch can turn an unreviewed contract into a live gift rail.
export const GIFT_DEPLOYMENTS:Readonly<Partial<Record<GiftNetwork,GiftDeployment>>>=Object.freeze({})
const rpc=(network:GiftNetwork)=>({base:process.env.PRIVATE_RPC_URL,arbitrum:process.env.PRIVATE_RPC_URL_ARB,arc:process.env.PRIVATE_RPC_URL_ARC_MAINNET,ethereum:process.env.PRIVATE_RPC_URL_ETHEREUM,polygon:process.env.PRIVATE_RPC_URL_POLYGON}[network])
const service=createGiftService({store:durableGiftStore,deployment:network=>GIFT_DEPLOYMENTS[network],wallet:async(userId,network)=>{const link=await readCircleLink(circleLinkKey(userId,network));return link?.privyUserId===userId&&link.chain===network?{address:link.circleWalletAddress as Address,id:link.circleWalletId}:undefined},observe:async(record,receiptHint)=>{const deployment=GIFT_DEPLOYMENTS[record.deployment.network],url=rpc(record.deployment.network);if(!deployment||JSON.stringify(deployment)!==JSON.stringify(record.deployment)||!url)throw new GiftError(503,'Gift network is not enabled.');return observeGift(createPublicClient({transport:http(url,{timeout:10000,retryCount:1})}),record,receiptHint)},challenge:giftCircleChallenge})
export default createGiftHandler({service,identity:async req=>{const identity=await verifiedPrivyUser(req),profile=await localCurrencyProfileRepository.get(identity.userId);return {userId:identity.userId,handle:profile?.pocketId||''}}})
