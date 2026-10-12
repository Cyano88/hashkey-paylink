import type { PocketActivityRow } from '../models/pocketActivity'
import PocketActivityListRow from './PocketActivityListRow'

export default function PocketActivityList({rows,onSelect,title}:{rows:PocketActivityRow[];onSelect:(row:PocketActivityRow)=>void;title?:(row:PocketActivityRow)=>string|undefined}) {
  return <>{rows.map(row=><PocketActivityListRow key={row.eventId+':'+row.txHash} row={row} title={title?.(row)} onClick={()=>onSelect(row)}/>)}</>
}
