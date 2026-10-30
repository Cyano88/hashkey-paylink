import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom'
import DocsLayout from '../pages/docs/DocsLayout'
import DocsHome from '../pages/docs/DocsHome'
import GettingStarted from '../pages/docs/GettingStarted'
import ApiReference from '../pages/docs/ApiReference'
import FundingDocs from '../pages/docs/FundingDocs'
import {PocketOverview,PocketPay,PocketTransfers,PocketExchange} from '../pages/docs/PocketDocs'
import {PocketStocks,PocketEarn,PocketEsim,PocketLocalPayments,PocketGifts,PocketCollect,PocketAccount} from '../pages/docs/PocketFeatureDocs'
import SecurityDocs from '../pages/docs/SecurityDocs'
import EnvironmentDocs from '../pages/docs/EnvironmentDocs'
import ComplianceDocs from '../pages/docs/ComplianceDocs'
import TermsDocs from '../pages/docs/TermsDocs'
import PrivacyDocs from '../pages/docs/PrivacyDocs'
import AccountDeletionDocs from '../pages/docs/AccountDeletionDocs'
export default function DocsApp(){return <BrowserRouter><Routes>
 <Route index element={<Navigate to="/docs" replace/>}/>
 <Route path="docs" element={<DocsLayout/>}>
  <Route index element={<DocsHome/>}/>
  <Route path="getting-started" element={<GettingStarted/>}/>
  <Route path="api" element={<ApiReference/>}/>
  <Route path="funding" element={<FundingDocs/>}/>
  <Route path="pocket" element={<PocketOverview/>}/>
  <Route path="pocket/pay" element={<PocketPay/>}/>
  <Route path="pocket/transfers" element={<PocketTransfers/>}/>
  <Route path="pocket/exchange" element={<PocketExchange/>}/>
  <Route path="pocket/stocks" element={<PocketStocks/>}/>
  <Route path="pocket/earn" element={<PocketEarn/>}/>
  <Route path="pocket/esim" element={<PocketEsim/>}/>
  <Route path="pocket/local-payments" element={<PocketLocalPayments/>}/>
  <Route path="pocket/gifts" element={<PocketGifts/>}/>
  <Route path="pocket/collect" element={<PocketCollect/>}/>
  <Route path="pocket/collections" element={<Navigate to="/docs/pocket/transfers" replace/>}/>
  <Route path="pocket/account" element={<PocketAccount/>}/>
  <Route path="environment" element={<EnvironmentDocs/>}/>
  <Route path="security" element={<SecurityDocs/>}/>
  <Route path="compliance" element={<ComplianceDocs/>}/>
  <Route path="terms" element={<TermsDocs/>}/>
  <Route path="privacy" element={<PrivacyDocs/>}/>
  <Route path="account-deletion" element={<AccountDeletionDocs/>}/>
  <Route path="sdk/*" element={<Navigate to="/docs/getting-started#sample" replace/>}/>
  <Route path="wallets" element={<Navigate to="/docs/pocket" replace/>}/>
  <Route path="*" element={<Navigate to="/docs" replace/>}/>
 </Route>
 <Route path="*" element={<Navigate to="/docs" replace/>}/>
</Routes></BrowserRouter>}
