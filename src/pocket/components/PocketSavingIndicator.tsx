import {Loader2} from './PocketIcons'
export default function PocketSavingIndicator({label='Saving'}:{label?:string}){
 return <span role="status" aria-label={label} className="inline-flex items-center justify-center gap-2"><Loader2 aria-hidden="true" role="presentation" className="h-4 w-4"/>Saving�</span>
}
