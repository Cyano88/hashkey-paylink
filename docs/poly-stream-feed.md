# Poly Stream Feed

`public/poly-stream-feed.json` is the default match feed for the Polymarket Tools -> Poly Stream section.

The backend route `/api/poly-stream` reads this file first when `POLY_STREAM_FEED_URL` is not configured. Each match row becomes a Poly Stream match widget or fixture row in the Telegram payment-links UI.

Use this feed for curated World Cup match context, official schedule links, and verified watch/provider links. Do not add unofficial stream mirrors.

## Match Shape

```json
{
  "tag": "Live now",
  "title": "USA vs Paraguay",
  "time": "Now",
  "venue": "Los Angeles Stadium",
  "status": "Live/recent",
  "marketContext": "Short market context for LP Scout handoff.",
  "sourceUrl": "https://www.fifa.com/...",
  "watchUrl": "https://official-provider.example/watch"
}
```

`watchUrl` is optional. If it is blank, the UI shows the official schedule link and LP Scout action only.

## Remote Override

Set `POLY_STREAM_FEED_URL` in Render to point `/api/poly-stream` at a remote JSON feed instead of the committed local file:

```env
POLY_STREAM_FEED_URL=https://example.com/poly-stream.json
POLY_STREAM_CACHE_MS=600000
```

This lets match rows and watch links change without redeploying Hash PayLink.
