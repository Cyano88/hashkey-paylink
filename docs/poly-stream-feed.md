# World Cup Scores Provider

The Polymarket Tools -> World Cup Scores section is provider-only. It does not use committed fixture rows or stale local fallback data.

`/api/poly-stream` returns Sportmonks/API-FOOTBALL fixture data for the Hash PayLink live score widget, then enriches each fixture with Polymarket Gamma market data when an exact match can be found.

If no exact market URL is mapped, the UI does not route users to a loose Polymarket search page.

## Recommended Provider

Use Sportmonks first for football truth. It has World Cup-focused live score endpoints, fixture filters, participants, scores, states, venues, and lineups/events through includes. Polymarket routing and odds must come from Polymarket, not from the sports provider.

Render env:

```env
POLY_STREAM_PROVIDER=sportmonks
POLY_STREAM_API_KEY=your_sportmonks_token
POLY_STREAM_LEAGUE_ID=732
POLY_STREAM_FIXTURE_MODE=auto
POLY_STREAM_CACHE_MS=60000
POLY_STREAM_LIMIT=12
POLYMARKET_MARKET_LOOKUP=1
POLYMARKET_LOOKUP_LIMIT=20
```

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

The API tries Polymarket Gamma search first and only exposes a Trade button when both teams are confidently matched. Manual mapping remains the override for exact URLs. Do not use search links as production market links. Map exact URLs by title or provider fixture id:

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

The Polymarket and LP Scout buttons remain hidden until Gamma finds a confident match or one of these keys resolves.
