import {useNavigate} from 'react-router-dom'
import PocketBottomSheet from './PocketBottomSheet'
import {Lock} from './PocketIcons'
import {POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
export default function PocketKycGate({pending=false,error='',advanced=false,limitReached=false,remainingNgn,onClose}:{pending?:boolean;error?:string;advanced?:boolean;limitReached?:boolean;remainingNgn?:number;onClose:()=>void}) {
 const navigate=useNavigate()
 const title=limitReached?'Daily limit reached':advanced?'Increase your daily limit':pending?'Verification in progress':'Verify your identity'
 return <PocketBottomSheet title={title} onClose={onClose} showCloseButton dismissOnBackdrop={false}>
  <div className="pb-2 pt-3 text-center"><Lock aria-hidden="true" className="mx-auto h-12 w-12 text-gray-950 dark:text-white"/>
   <h2 className="mt-5 text-xl font-semibold">{title}</h2>
   <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{error||(limitReached?'Your bank-transfer allowance resets at midnight Nigeria time.':advanced?`${remainingNgn===undefined?'':`₦${remainingNgn.toLocaleString('en-NG')} remaining today. `}Complete Advanced verification for a higher limit.`:pending?'Your result will update here once confirmed.':'Complete Basic verification to transfer up to ₦50,000 daily.')}</p>
   <button className="pocket-cta-primary mt-6 w-full" onClick={()=>{onClose();if(!limitReached)navigate(POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc'+(advanced?'&level=advanced':''))}}>{limitReached?'Done':advanced?'Get advanced verification':pending?'View verification':'Verify now'}</button>
  </div>
 </PocketBottomSheet>
}
