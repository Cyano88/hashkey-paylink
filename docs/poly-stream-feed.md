# World Cup Scores Provider

The Polymarket Tools -> World Cup Scores section is provider-only. It does not use committed fixture rows or stale local fallback data.

`/api/poly-stream` returns Sportmonks/API-FOOTBALL fixture data for exact Polymarket mapping. The visible match board can use a Sportmonks widget embed, while Hash PayLink controls the Polymarket and LP Scout buttons.

If no exact market URL is mapped, the UI does not route users to a loose Polymarket search page.

## Recommended Provider

Use Sportmonks first for this feature. It has World Cup-focused football data, live score endpoints, fixture filters, participants, scores, states, venues, and lineups/events through includes.

Render env:

```env
POLY_STREAM_PROVIDER=sportmonks
POLY_STREAM_API_KEY=your_sportmonks_token
POLY_STREAM_LEAGUE_ID=732
POLY_STREAM_FIXTURE_MODE=auto
POLY_STREAM_CACHE_MS=60000
POLY_STREAM_LIMIT=12
```

## Sportmonks Widget Embed

Create a live score widget in MySportmonks, authorize the Hash PayLink domain, then copy the embed values into Render.

Use the iframe URL if Sportmonks provides one:

```env
VITE_SPORTMONKS_WIDGET_URL=https://...
```

Or use the container/script version:

```env
VITE_SPORTMONKS_WIDGET_CSS_URL=https://...
VITE_SPORTMONKS_WIDGET_JS_URL=https://...
VITE_SPORTMONKS_WIDGET_HTML=<div ...></div>
```

Do not put the Sportmonks API token in any `VITE_` variable.

Modes:

```env
POLY_STREAM_FIXTURE_MODE=auto
POLY_STREAM_FIXTURE_MODE=live
POLY_STREAM_FIXTURE_MODE=next
POLY_STREAM_FIXTURE_MODE=last
```

`auto` fetches live matches first and upcoming matches second. Use this for the consumer UI so the section does not go empty before kickoff.

## API-FOOTBALL Alternative

API-FOOTBALL is also supported if we decide to use the API-SPORTS account.

```env
POLY_STREAM_PROVIDER=api-football
POLY_STREAM_API_KEY=your_api_football_key
POLY_STREAM_LEAGUE_ID=1
POLY_STREAM_SEASON=2026
POLY_STREAM_FIXTURE_MODE=auto
POLY_STREAM_CACHE_MS=60000
POLY_STREAM_LIMIT=12
```

## Exact Polymarket Mapping

Do not use search links as production market links. Map exact URLs by title or provider fixture id:

```env
POLYMARKET_MATCH_URLS={"USA vs Paraguay":"https://polymarket.com/event/exact-event-slug","sportmonks:123456":"https://polymarket.com/event/exact-event-slug","api-football:78910":"https://polymarket.com/event/exact-event-slug"}
```

Valid mapping keys:

```text
USA vs Paraguay
sportmonks:<fixtureId>
api-football:<fixtureId>
league:<leagueId>:<home>:<away>
```

The Polymarket and LP Scout buttons remain hidden until one of these keys resolves.
