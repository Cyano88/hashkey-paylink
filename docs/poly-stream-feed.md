# World Cup Score Feed

`public/poly-stream-feed.json` is the default match feed for the Polymarket Tools -> World Cup Scores section.

The backend route `/api/poly-stream` reads this file first when `POLY_STREAM_FEED_URL` is not configured. Each row becomes a compact match widget that can route users into a related Polymarket market/search and then into LP Scout for paid book-depth checks.

This section is not a streaming feature. Do not add unofficial stream mirrors. If a live score provider is added later, map its scoreboard fields into this shape and keep Polymarket links as the primary trading handoff.

## Match Shape

```json
{
  "tag": "Live now",
  "title": "USA vs Paraguay",
  "time": "Now",
  "venue": "Los Angeles Stadium",
  "status": "Live",
  "homeScore": 1,
  "awayScore": 0,
  "clock": "23'",
  "marketContext": "Short market context for LP Scout handoff.",
  "sourceUrl": "https://official-match-source.example",
  "polymarketUrl": "https://polymarket.com/event/exact-market-or-event",
  "watchUrl": ""
}
```

`polymarketUrl` should be an exact Polymarket event/market link when available. If it is omitted, the UI falls back to Polymarket search using the match title.

`sourceUrl` should point to an official fixture, federation, tournament, or data-provider page. Use it for verification context, not streaming.

## Remote Override

Set `POLY_STREAM_FEED_URL` in Render to point `/api/poly-stream` at a remote JSON feed instead of the committed local file:

```env
POLY_STREAM_FEED_URL=https://example.com/poly-stream.json
POLY_STREAM_CACHE_MS=600000
```

This lets scores, clocks, statuses, and Polymarket links change without redeploying Hash PayLink.
