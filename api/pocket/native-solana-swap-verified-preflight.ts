import {preflightNativeSolanaSwap} from './native-solana-swap-preflight.js'
import {inspectNativeSolanaSwapEffects} from './native-solana-swap-effects.js'

/** Composes structural, RPC and exact wallet-effect checks. The authenticated
 * execution handler must bind this proof to the reviewed, sealed transaction. */
export async function verifiedNativeSolanaSwapPreflight(...args:Parameters<typeof preflightNativeSolanaSwap>){
 // A confirmed bank may advance between RPCs. Retry the reads, never substitute
 // slots or accept unrelated balance changes as transaction output.
 for(let attempt=0;attempt<3;attempt++){
  const preflight=await preflightNativeSolanaSwap(...args)
  if(preflight.snapshotSlot!==preflight.simulationSlot)continue
  const effects=inspectNativeSolanaSwapEffects(args[0],preflight)
  return {...preflight,requiresEffectValidation:false as const,effects,executionAvailable:false as const}
 }
 throw Error('SOL swap estimate changed while checking. Try again.')
}
