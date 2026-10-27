import {lazy,Suspense} from 'react'
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom'
import DeveloperLayout from './DeveloperLayout'
import DeveloperLoadingSkeleton from '../components/DeveloperLoadingSkeleton'
const Operations=lazy(()=>import('../pages/OperationsWorkspacePage'))
export default function AdminApp(){return <BrowserRouter><Suspense fallback={<DeveloperLoadingSkeleton fullPage/>}><Routes><Route element={<DeveloperLayout/>}>
  <Route index element={<Navigate to="/admin" replace/>}/>
  <Route path="admin" element={<Operations/>}/>
  <Route path="admin/team" element={<Operations/>}/>
  <Route path="admin/workspaces/:workspaceId" element={<Operations/>}/>
  <Route path="admin/workspaces/:workspaceId/:section" element={<Operations/>}/>
  <Route path="*" element={<Navigate to="/admin" replace/>}/>
</Route></Routes></Suspense></BrowserRouter>}
