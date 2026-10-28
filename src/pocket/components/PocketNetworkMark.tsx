import { cn } from '../../lib/utils'
const networks: Record<string,{src:string;dark:boolean}> = {
 bsc:{src:'/brand/bnb.svg',dark:false},xlayer:{src:'/brand/xlayer-logo.svg',dark:false},base:{src:'/brand/base-logo.jpeg',dark:false}, arbitrum:{src:'/brand/arbitrum-logo.jpeg',dark:false},solana:{src:'/brand/solana-logo.jpeg',dark:true},arc:{src:'/brand/arc-logo.jpeg',dark:true},polygon:{src:'/brand/polygon-logo.png',dark:false},ethereum:{src:'/brand/ethereum-logo.png',dark:false},
}
export default function PocketNetworkMark({network}:{network:string}) {
 const mark=networks[network]
 return mark ? <img src={mark.src} alt="" className={cn('h-6 w-6 shrink-0 rounded-md grayscale contrast-200',['xlayer','bsc'].includes(network)?'object-contain p-[3px]':'object-cover',mark.dark?'invert dark:invert-0':'dark:invert')} /> : null
}
