import {mutateDurableJson} from '../render-durable-store.js'

type Cursor = {after: string}
type Mutate = (update: (previous: Cursor | undefined) => Cursor) => Promise<Cursor>

/** Persist a rotating cursor so restarting the worker does not starve later owners. */
export function createFairOwnerBatch(mutate: Mutate) {
  return async (owners: string[], limit: number): Promise<string[]> => {
    if (!Number.isSafeInteger(limit) || limit < 1) throw Error('Invalid owner batch size.')
    const sorted = [...new Set(owners.filter(Boolean))].sort()
    if (sorted.length <= limit) return sorted
    let batch: string[] = []
    await mutate(previous => {
      let start = previous?.after ? sorted.findIndex(owner => owner > previous.after) : 0
      if (start < 0) start = 0
      batch = Array.from({length: limit}, (_, offset) => sorted[(start + offset) % sorted.length])
      return {after: batch[batch.length - 1]}
    })
    return batch
  }
}
export const selectPocketPushOwners = createFairOwnerBatch(update => mutateDurableJson<Cursor>('pocket:money-push-owner-cursor:v1', update))
