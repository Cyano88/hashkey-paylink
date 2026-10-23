import { useNavigate } from 'react-router-dom'
import PocketFlowHeader from './PocketFlowHeader'
import { ChevronRight, Deposit, RequestMoney, Send, UserRound } from './PocketIcons'
import { xStockPath } from '../lib/pocketRail'
export default function PocketStockTransferMenu({kind}:{kind:'send'|'receive'}){
 const navigate=useNavigate()
 const actions=kind==='receive'?[{title:'Receive on X Layer',detail:'Receive assets into your wallet',Icon:Deposit,path:xStockPath('receive')+'?mode=address',label:''},{title:'Request',detail:'Request assets from a Pocket user',Icon:RequestMoney,path:xStockPath('request'),label:''}]:[{title:'X Layer address',detail:'Send to a wallet address',Icon:Send,path:xStockPath('send')+'?mode=address',label:'Gas'},{title:'Pocket ID',detail:'Free transfers are not available yet',Icon:UserRound,path:xStockPath('send')+'?mode=pocket',label:'Free'}]
 return <><PocketFlowHeader centered title={kind==='send'?'Send':'Receive'} onBack={()=>navigate(xStockPath('home'))}/><section className="divide-y divide-gray-100 dark:divide-[#262626]" aria-label={kind==='send'?'Send options':'Receive options'}>{actions.map(a=><button key={a.title} className="flex min-h-20 w-full items-center gap-4 py-4 text-left" onClick={()=>navigate(a.path)}><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-[#171717]"><a.Icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{a.title}</span><span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">{a.detail}</span></span>{a.label&&<span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold dark:bg-white/10">{a.label}</span>}<ChevronRight className="h-4 w-4 text-gray-400"/></button>)}</section></>
}
