import type { PocketActivityRow } from '../models/pocketActivity'
import PocketActivityListRow from './PocketActivityListRow'

export default function PocketActivityList({rows,onSelect,title}:{rows:PocketActivityRow[];onSelect:(row:PocketActivityRow)=>void;title?:(row:PocketActivityRow)=>string|undefined}) {
  const groups: Array<{key:string;label:string;rows:PocketActivityRow[]}> = []
  for (const row of rows) {
    const date = new Date(row.ts)
    const valid = Number.isFinite(date.getTime())
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'unknown'
    const label = valid ? date.toLocaleDateString('en-US',{month:'short',day:'numeric',...(date.getFullYear() !== new Date().getFullYear() ? {year:'numeric' as const} : {})}) : 'Earlier'
    const last = groups[groups.length-1]
    if(last?.key===key)last.rows.push(row)
    else groups.push({key,label,rows:[row]})
  }
  return <>{groups.map((group,index)=><section key={group.key} aria-label={group.label} data-pocket-activity-day className={index ? 'mt-5' : undefined}>
    <h3 className="pb-1 pt-2 text-xs font-medium text-gray-500 dark:text-gray-400">{group.label}</h3>
    {group.rows.map(row=><PocketActivityListRow key={row.eventId+':'+row.txHash} row={row} title={title?.(row)} onClick={()=>onSelect(row)}/>)}
  </section>)}</>
}
