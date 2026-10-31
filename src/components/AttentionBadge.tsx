export default function AttentionBadge({count,label}:{count:number;label:string}){
 return count>0?<span aria-label={`${count} ${label}`} className="ml-2 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-none text-white tabular-nums">{count>99?'99+':count}</span>:null
}
