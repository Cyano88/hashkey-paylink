import {usePrivy} from '@privy-io/react-auth'
import PocketKycPanel from '../pocket/components/PocketKycPanel'

export default function PersonalVerificationPanel(){
 const {getAccessToken,user}=usePrivy()
 return <div className="max-w-2xl"><h1 className="text-2xl font-semibold">Personal verification</h1><p className="mt-3 text-sm leading-6 text-gray-500">Verify here with the same identity checks used in Pocket. Your result is shared across both when you use the same account.</p><p className="mt-2 text-sm leading-6 text-gray-500">In Nigeria, complete Basic verification before Advanced. Uganda uses its National ID verification flow. Verification does not automatically enable a payment route or increase your limits.</p>{new URLSearchParams(window.location.search).get('continueOnPhone')==='1' && <p className="mt-3 text-sm leading-6 text-gray-500">Continue with the same account you used on your computer. Completed checks are already saved.</p>}<PocketKycPanel key={user?.id} getAccessToken={getAccessToken} email={user?.email?.address??''} surface="developer" initialLevel={new URLSearchParams(window.location.search).get('level')==='basic'?'basic':'advanced'}/></div>
}
