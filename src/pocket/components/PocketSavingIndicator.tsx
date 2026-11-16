export default function PocketSavingIndicator({label='Saving'}:{label?:string}){
 return <span role="status" aria-label={label} className="mx-auto inline-flex items-center justify-center gap-2"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"/>Saving�</span>
}
