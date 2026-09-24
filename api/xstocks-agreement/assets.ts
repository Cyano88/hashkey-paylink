import { configuredXLayerAssets } from './registry.js';
import { tradeXLayerClient, tradeXLayerEnabled, verifyFactory } from './planner.js';
import { TRADE_FACTORY_ABI, TRADE_TOKEN_ABI, TRADE_XLAYER_FACTORY } from '../../src/lib/xstocksAgreement/protocol.js';
import { rankXStockAssets, xStockMetadata, type XStockPaymentAsset } from '../../src/lib/xstocksAgreement/xStocksAssets.js';

// Pocket metadata is intersected with the server registry and pinned factory.
export async function tradeXLayerAssets(env:NodeJS.ProcessEnv, client = tradeXLayerClient(env)) {
  if (!tradeXLayerEnabled(env)) return {enabled:false, assets:[] as XStockPaymentAsset[]};
  const candidates = [...configuredXLayerAssets(env).values()].filter(asset => xStockMetadata(asset.address));
  const block = await client.getBlock({blockTag:'latest'});
  if (!block.hash || Math.abs(Date.now()/1000 - Number(block.timestamp)) > 60) throw Error('Asset approvals are unavailable.');
  await verifyFactory(client, block.number);
  const reads = candidates.length ? await client.multicall({blockNumber:block.number, batchSize:16_384, contracts:candidates.flatMap(asset => [
    {address:TRADE_XLAYER_FACTORY, abi:TRADE_FACTORY_ABI, functionName:'approvedTokens' as const, args:[asset.address] as const},
    {address:asset.address, abi:TRADE_TOKEN_ABI, functionName:'decimals' as const},
  ])}) : [];
  const assets:XStockPaymentAsset[] = [];
  candidates.forEach((asset,index) => {
    const approved=reads[index*2], precision=reads[index*2+1];
    if (approved.status !== 'success' || precision.status !== 'success') throw Error('Asset approvals are unavailable.');
    if (approved.result !== true || Number(precision.result) !== asset.decimals) return;
    const metadata=xStockMetadata(asset.address)!;
    assets.push({...asset, symbol:metadata.symbol, name:metadata.name, logoURI:metadata.sourceIcon});
  });
  if ((await client.getBlock({blockNumber:block.number})).hash !== block.hash) throw Error('Asset approvals changed. Refresh.');
  return {enabled:true, assets:rankXStockAssets(assets)};
}
