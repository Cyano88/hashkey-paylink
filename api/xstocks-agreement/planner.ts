import { xLayer } from 'viem/chains';
import { createPublicClient, http, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem';
import { TRADE_FACTORY_ABI as factoryAbi, TRADE_ESCROW_ABI as escrowAbi, TRADE_TOKEN_ABI as tokenAbi, TRADE_XLAYER_FACTORY as factory, TRADE_XLAYER_ARBITER as arbiter, type TradeXLayerAction, type TradeXLayerStatus } from '../../src/lib/xstocksAgreement/protocol.js';

const runtimeHash = '0xcc80a2e8e46179070a0a664636e29fa5a83f62eed9d97139aacca5d95c14ec26';
export function tradeXLayerClient(env: NodeJS.ProcessEnv) {
  return createPublicClient({ chain: xLayer, transport: http(env.XLAYER_MAINNET_RPC_URL || 'https://rpc.xlayer.tech', { timeout: 15000, retryCount: 1 }) });
}
export function tradeXLayerEnabled(env: NodeJS.ProcessEnv) { return env.HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED === 'true'; }
export async function verifyFactory(client: ReturnType<typeof tradeXLayerClient>, blockNumber?: bigint) {
  if (await client.getChainId() !== 196) throw Error('Trade network mismatch.');
  const code = await client.getCode({ address: factory, blockNumber });
  if (!code || keccak256(code) !== runtimeHash) throw Error('Trade factory does not match the verified deployment.');
  if (getAddress(await client.readContract({ address: factory, abi: factoryAbi, functionName:'arbiter', blockNumber })) !== arbiter) throw Error('Trade authority mismatch.');
}
export function tradeLifecycleActions(state: number, buyer: boolean, now: bigint, deadlines: { fundBy: bigint; dispatchBy: bigint; deliveryBy: bigint; inspectUntil: bigint }): TradeXLayerAction[] {
  if (state <= 1) return [...(now < deadlines.fundBy ? (state === 0 && !buyer ? ['accept' as const] : state === 1 && buyer ? ['fund' as const] : []) : []), 'cancel'];
  if (state === 2) return buyer ? (now >= deadlines.dispatchBy ? ['missedDispatch'] : []) : [...(now < deadlines.dispatchBy ? ['dispatch' as const] : []), 'refund'];
  if (state === 3) return buyer ? ['receipt','release','dispute'] : ['refund', ...(now >= deadlines.deliveryBy ? ['dispute' as const] : [])];
  if (state === 4) return buyer ? ['release', ...(now < deadlines.inspectUntil ? ['dispute' as const] : [])] : ['refund', ...(now >= deadlines.inspectUntil ? ['inspectionRelease' as const] : [])];
  if (state === 5) return buyer ? [] : ['refund'];
  return [];
}
export async function prepareTradeXLayerAction(input: { env: NodeJS.ProcessEnv; binding: any; account: Address; action?: TradeXLayerAction; evidence?: unknown }, client = tradeXLayerClient(input.env)): Promise<TradeXLayerStatus> {
  if (!tradeXLayerEnabled(input.env)) return { enabled:false, actions:[] };
  const b = input.binding, t = b.contractTerms;
  if (b.chainId !== 196 || getAddress(b.factory) !== factory || getAddress(t.arbiter) !== arbiter || b.termsHash !== t.termsHash) throw Error('Trade deployment mismatch.');
  const buyer = getAddress(t.buyer) === getAddress(input.account);
  if (!buyer && getAddress(t.seller) !== getAddress(input.account)) throw Error('This wallet is not a participant.');
  const head = await client.getBlockNumber();
  if (head < 2n) throw Error('Confirmed Trade state is unavailable.');
  const blockNumber = head - 2n, block = await client.getBlock({ blockNumber });
  await verifyFactory(client, blockNumber);
  const key = keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'bytes32'}], [t.seller,t.buyer,t.offerId]));
  const escrow = await client.readContract({ address:factory, abi:factoryAbi, functionName:'escrows', args:[key], blockNumber });
  const current = await client.readContract({ address:factory, abi:factoryAbi, functionName:'escrows', args:[key] });
  if (escrow !== current) return { enabled:true, actions:[], pending:true };
  const approved = await client.readContract({ address:factory, abi:factoryAbi, functionName:'approvedTokens', args:[t.token], blockNumber });
  const decimals = await client.readContract({ address:t.token, abi:tokenAbi, functionName:'decimals', blockNumber });
  if (decimals !== t.decimals) throw Error('Settlement token decimals changed.');
  const result: TradeXLayerStatus = { observedBlock:blockNumber.toString(), enabled:true, escrow, amount:String(t.amount), token:t.token, decimals, actions:[] };
  let to: Address = escrow, data: Hex | undefined;
  if (escrow === zeroAddress) {
    if (!buyer && approved && BigInt(t.fundBy) > block.timestamp) result.actions = ['create'];
    if (input.action === 'create') {
      to = factory;
      data = encodeFunctionData({ abi:factoryAbi, functionName:'create', args:[{...t, amount:BigInt(t.amount), fundBy:BigInt(t.fundBy)}] });
    }
  } else {
    // The pinned immutable factory is the only writer of this registry. Verify every bound term as well.
    const names = ['offerId','termsHash','buyer','seller','arbiter','token','amount','fundBy','dispatchWindow','deliveryWindow','inspectionWindow'] as const;
    for (const name of names) {
      const actual = await client.readContract({ address:escrow, abi:escrowAbi, functionName:name, blockNumber });
      if (String(actual).toLowerCase() !== String(t[name]).toLowerCase()) throw Error('Escrow terms mismatch: '+name);
    }
    const state = Number(await client.readContract({ address:escrow, abi:escrowAbi, functionName:'state', blockNumber }));
    const currentState = Number(await client.readContract({ address:escrow, abi:escrowAbi, functionName:'state' }));
    result.state = state;
    if (state !== currentState) return {...result, pending:true};
    const [dispatchBy, deliveryBy, inspectUntil] = await Promise.all((['dispatchBy','deliveryBy','inspectUntil'] as const).map(functionName => client.readContract({ address:escrow, abi:escrowAbi, functionName, blockNumber })));
    result.actions = tradeLifecycleActions(state, buyer, block.timestamp, {fundBy:BigInt(t.fundBy),dispatchBy,deliveryBy,inspectUntil});
    if (result.actions.includes('fund')) {
      if (!approved) result.actions = result.actions.filter(a => a !== 'fund');
      else {
        const allowance = await client.readContract({ address:t.token, abi:tokenAbi, functionName:'allowance', args:[input.account,escrow], blockNumber });
        if (allowance < BigInt(t.amount)) result.actions = result.actions.map(a => a === 'fund' ? 'approve' : a);
      }
    }
    const action = input.action;
    if (action === 'approve') {
      // Exact allowance only; clear a nonzero insufficient allowance first for restrictive ERC20s.
      const allowance = await client.readContract({ address:t.token, abi:tokenAbi, functionName:'allowance', args:[input.account,escrow] });
      to = t.token;
      data = encodeFunctionData({ abi:tokenAbi, functionName:'approve', args:[escrow, allowance === 0n ? BigInt(t.amount) : 0n] });
    } else if (action === 'accept' || action === 'fund') {
      data = encodeFunctionData({ abi:escrowAbi, functionName:action === 'accept' ? 'acceptTerms' : 'fund', args:[t.termsHash] });
    } else if (action === 'dispatch' || action === 'refund' || action === 'dispute') {
      if (typeof input.evidence !== 'string' || input.evidence.trim().length < 10 || input.evidence.length > 2000) throw Error('Add a reference or explanation of at least 10 characters.');
      data = encodeFunctionData({ abi:escrowAbi, functionName:action === 'dispatch' ? 'markDispatched' : action === 'refund' ? 'refundBySeller' : 'openDispute', args:[keccak256(stringToHex(input.evidence.trim()))] });
    } else if (action) {
      const functions = { cancel:'cancelUnfunded', receipt:'confirmReceipt', release:'approveRelease', missedDispatch:'refundUndispatched', inspectionRelease:'releaseAfterInspection' } as const;
      if (action in functions) data = encodeFunctionData({ abi:escrowAbi, functionName:functions[action as keyof typeof functions] });
    }
  }
  if (input.action) {
    if (!result.actions.includes(input.action) || !data) throw Error('This action is no longer available. Refresh the trade.');
    await client.call({ account:input.account, to, data, value:0n });
    result.transaction = { account:input.account, to, data, chainId:196, value:'0' };
  }
  if (!block.hash || (await client.getBlock({blockNumber})).hash !== block.hash || await client.getChainId() !== 196) throw Error('Trade chain state changed. Refresh and try again.');
  return result;
}
