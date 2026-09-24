// Metadata and ordering reused from Pocket's XStocks catalogue (2026-09-23).
// Metadata identifies an asset; it never authorizes it for escrow.
import catalogue from './xStocksCatalog.json';
import ranking from './xStocksRanking.json';
export type XStockPaymentAsset = { address:string; symbol:string; name:string; decimals:number; logoURI?:string };
const byAddress = new Map(catalogue.assets.map(asset => [asset.address.toLowerCase(), asset]));
export function xStockMetadata(address?:string) { return byAddress.get(address?.toLowerCase() || ''); }
export function xStockPaymentLabel(terms:{currency:string;settlementToken?:string}) {
  if (terms.currency !== 'XLAYER_ASSET') return terms.currency;
  const asset = xStockMetadata(terms.settlementToken);
  return asset ? asset.name+' ('+asset.symbol+')' : 'Token ('+(terms.settlementToken || 'not selected')+')';
}
export function rankXStockAssets(assets:XStockPaymentAsset[]) {
  const rank = (symbol:string) => { const index = ranking.symbols.indexOf(symbol); return index < 0 ? 1000 : index; };
  return [...assets].sort((a,b) => rank(a.symbol)-rank(b.symbol) || a.symbol.localeCompare(b.symbol));
}
