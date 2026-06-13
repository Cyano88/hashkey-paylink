# World Cup Scores Provider

The Polymarket Tools -> World Cup Scores section is provider-only. It does not use committed fixture rows or stale local fallback data.

`/api/poly-stream` returns live score widgets from a sports data provider, then attaches exact Polymarket links only when they are explicitly mapped. If no exact market URL is mapped, the UI shows `Market pending` instead of routing users to a loose Polymarket search page.

## Recommended Provider

Use Sportmonks first for this feature. It has World Cup-focused football data, live score endpoints, fixture filters, participants, scores, states, venues, and lineups/events through includes.

Render env:

```env
POLY_STREAM_PROVIDER=sportmonks
POLY_STREAM_API_KEY=your_sportmonks_token
POLY_STREAM_LEAGUE_ID=732
POLY_STREAM_FIXTURE_MODE=live
POLY_STREAM_CACHE_MS=60000
POLY_STREAM_LIMIT=12
```

Modes:

```env
POLY_STREAM_FIXTURE_MODE=live
POLY_STREAM_FIXTURE_MODE=next
POLY_STREAM_FIXTURE_MODE=last
```

## API-FOOTBALL Alternative

API-FOOTBALL is also supported if we decide to use the API-SPORTS account.

```env
POLY_STREAM_PROVIDER=api-football
POLY_STREAM_API_KEY=your_api_football_key
POLY_STREAM_LEAGUE_ID=1
POLY_STREAM_SEASON=2026
POLY_STREAM_FIXTURE_MODE=live
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

The button label remains `Market pending` until one of these keys resolves.
