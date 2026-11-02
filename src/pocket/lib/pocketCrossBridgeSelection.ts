import {crossBridgeAssets,crossBridgeNetwork,crossBridgePair,type CrossBridgeNetwork} from './pocketCrossBridgeAssets'
export type CrossBridgeSelection={source:CrossBridgeNetwork;destination:CrossBridgeNetwork;from:string;to:string}
export function crossBridgeSelectionKey(s:CrossBridgeSelection){crossBridgePair(s.source,s.destination,s.from,s.to);return [s.source,s.from,s.destination,s.to].join(':')}
export function changeCrossBridgeNetwork(s:CrossBridgeSelection,side:'source'|'destination',value:CrossBridgeNetwork):CrossBridgeSelection{
 crossBridgeNetwork(value)
 if(value===s[side==='source'?'destination':'source'])throw Error('Choose different bridge networks.')
 const assetKey=side==='source'?'from':'to',allowed=crossBridgeAssets(value)
 const next={...s,[side]:value,[assetKey]:allowed.some(t=>t.symbol===s[assetKey])?s[assetKey]:'USDC'}
 crossBridgeSelectionKey(next);return next
}
export function changeCrossBridgeAsset(s:CrossBridgeSelection,side:'from'|'to',asset:string):CrossBridgeSelection{
 const next={...s,[side]:asset};crossBridgeSelectionKey(next);return next
}
export function reverseCrossBridgeSelection(s:CrossBridgeSelection):CrossBridgeSelection{
 const next={source:s.destination,destination:s.source,from:s.to,to:s.from};crossBridgeSelectionKey(next);return next
}
