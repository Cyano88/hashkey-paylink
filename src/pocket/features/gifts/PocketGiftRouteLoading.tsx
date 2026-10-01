import {POCKET_ROUTES} from '../../lib/pocketRoutes'
import {useNavigate} from 'react-router-dom'
import PocketGiftCreateSkeleton from './PocketGiftCreateSkeleton'
import PocketFlowHeader from '../../components/PocketFlowHeader'
import {PocketSkeletonBar} from '../../components/PocketContentSkeletons'
export function GiftCodeLoading(){return <div role="status" aria-label="Loading gift code form" aria-busy="true" className="mt-8"><PocketSkeletonBar className="h-4 w-64"/><PocketSkeletonBar className="mt-6 h-4 w-20"/><PocketSkeletonBar className="mt-2 h-14 w-full rounded-xl"/><PocketSkeletonBar className="mt-6 h-12 w-full rounded-full"/></div>}
export default function PocketGiftRouteLoading({kind}:{kind:'send'|'claim'|'preview'}){const navigate=useNavigate();if(kind==='send')return <PocketGiftCreateSkeleton onBack={()=>navigate(POCKET_ROUTES.transfer)}/>;return <main className="mx-auto min-h-[100dvh] max-w-md px-6 pb-8 pt-[max(1.5rem,var(--pocket-safe-top))]"><PocketFlowHeader title="Claim a gift" onBack={()=>navigate(POCKET_ROUTES.receive)}/>{kind==='claim'?<GiftCodeLoading/>:<div role="status" aria-label="Loading gift" className="mt-8 space-y-6"><PocketSkeletonBar className="aspect-[3/2] rounded-[28px]"/><PocketSkeletonBar className="mx-auto h-7 w-40"/><PocketSkeletonBar className="h-12 w-full"/></div>}</main>}
