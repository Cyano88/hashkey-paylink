export default function PocketVerificationBadge({level}:{level:'none'|'basic'|'advanced'}){
 const verified=level!=='none'
 return <span className={'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-semibold leading-4 '+(verified?'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300':'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300')}>{level==='advanced'?'Advanced verified':verified?'Basic verified':'Verification needed'}</span>
}
