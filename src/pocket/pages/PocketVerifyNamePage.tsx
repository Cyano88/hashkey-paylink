import {Navigate} from 'react-router-dom'
import {POCKET_BASE_PATH,POCKET_ROUTES} from '../lib/pocketRoutes'
// Compatibility for saved links; legacy bank-name enrollment no longer exists.
export default function PocketVerifyNamePage(){return <Navigate replace to={POCKET_BASE_PATH+POCKET_ROUTES.profile+'?feature=kyc'}/>}
