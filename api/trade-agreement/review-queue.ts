import { queryDurablePostgres } from '../render-durable-store.js'

export type TradeReviewQueueItem = { id: string; projectId: string; title: string; state: number | null; observedBlock: string | null }
export async function listArcTradeReviewQueue(projectIds: string[], filter: 'disputed' | 'all', cursor: string) {
  if (!projectIds.length) return { items: [], nextCursor: null }
  const result = await queryDurablePostgres<TradeReviewQueueItem>(`
    SELECT value->>'id' AS id, value->>'partnerId' AS "projectId",
      left(value->'terms'->>'title', 200) AS title,
      CASE WHEN value->'observed'->>'state' ~ '^[0-9]$'
        THEN (value->'observed'->>'state')::int ELSE NULL END AS state,
      value->'observed'->>'observedBlock' AS "observedBlock"
    FROM render_durable_kv
    WHERE store_key = 'hashpaylink:arc-hosted-trade:v1:' || (value->>'id')
      AND value->>'id' ~ '^tag_[a-f0-9]{64}$'
      AND value->>'partnerId' = ANY($1::text[])
      AND value->'terms'->>'kind' = 'trade'
      AND value->'binding'->>'policy' = 'trade-arc-usdc-v1' AND value->'binding'->>'chainId' = '5042'
      AND ($2 = 'all' OR value->'observed'->>'state' = '5')
      AND value->>'id' > $3
    ORDER BY value->>'id' ASC LIMIT 26
  `, [projectIds, filter, cursor])
  const items = result.rows.slice(0, 25)
  return { items, nextCursor: result.rows.length > 25 ? items[24].id : null }
}
