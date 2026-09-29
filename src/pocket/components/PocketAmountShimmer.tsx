import { PocketSkeletonBar } from './PocketContentSkeletons'
export default function PocketAmountShimmer({ label = 'Loading amount', className = '' }: { label?: string; className?: string }) {
 return <span role="status" aria-label={label} aria-busy="true" className={'inline-block max-w-full align-middle ' + className}><PocketSkeletonBar className="h-3 w-24" /></span>
}
