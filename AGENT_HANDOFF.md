# Hash PayLink Handoff

Last updated: 2026-06-12

## Repo

Main Hash PayLink repo:

```text
C:\Users\USER\Desktop\polymarket-lp-sentinel\hashkey-paylink
```

Deployment is Render only. Do not use Railway or Vercel.

Photon bot repo was not touched during the recent Hash PayLink UI/API work unless needed later for Telegram bot commands.

## Live URLs

```text
https://hashpaylink.com
https://hashkey-paylink.onrender.com
```

Polymarket Tools dashboard:

```text
https://hashpaylink.com/telegram/payment-links?section=market-tools&open=1
```

LP Scout:

```text
https://hashpaylink.com/telegram/payment-links?section=market-tools&service=lp-scout&open=1
```

World Cup News:

```text
https://hashpaylink.com/telegram/payment-links?section=market-tools&service=poly-worldcup-news&open=1
```

World Cup News API:

```text
https://hashpaylink.com/api/poly-worldcup-news
```

## Recent Commits

```text
e9a72286 Polish Polymarket news controls
7ad6d65a Compact Polymarket news panel
f9228384 Support Fanvibe news env names
33d01635 Add Polymarket World Cup news panel
5cd0cc97 Open Telegram dashboard to action cards
b40102c2 Polish agentic receipt separator
79e5a894 Harden LP Scout API response handling
```

## Completed

- LP Scout x402 agent-to-agent flow is working.
- Agent dashboard can execute the pending LP Scout x402 request.
- LP Scout result UI was changed toward a consumer-friendly chat/result style.
- LP Scout now focuses on one stronger conservative market instead of cluttering the UI with three alphas.
- Agent instructions were tightened for human LP users. Hash PayLink does not place/cancel/manage Polymarket orders.
- Hash PayLink receipt was branded as Hash PayLink Agentic Receipt.
- Receipt page has back navigation, smaller controls, download/share behavior work, and a cleaner Circle verification placeholder.
- Telegram payment-links modal no longer dumps users directly into the full Request USDC form by default.
- World Cup News was added under Polymarket Tools.
- Fanvibe-style news behavior was verified and adapted:
  - rotating lead article,
  - selectable list rows,
  - provider feed support,
  - image fallback,
  - compact internal scroll.
- World Cup News API supports both isolated Hash PayLink env names and Fanvibe-style env names.
- World Cup News UI was compacted:
  - no long page expansion,
  - fixed internal scroll,
  - smaller lead card,
  - no hover flicker,
  - muted scrollbar,
  - smaller action buttons,
  - removed the warning footer note.
- Marketplace remains present and marked Soon.

## News Provider Env

Hash PayLink accepts these env names:

```text
NEWS_API_KEY
NEWS_API_URL
NEWS_CACHE_MS
NEWS_PROVIDER
NEWS_QUERY
```

It also accepts isolated equivalents:

```text
POLY_NEWS_API_KEY
POLY_NEWS_API_URL
POLY_NEWS_CACHE_MS
POLY_NEWS_PROVIDER
POLY_NEWS_QUERY
```

Priority is `POLY_NEWS_*` first, then `NEWS_*`.

Last verified live API returned:

```text
providerConfigured: true
source: gnews
```

## Important Decisions

- Do not remove Marketplace. Leave it as Soon.
- Do not use Railway or Vercel for current deployment. Render only.
- Prefer agent-to-agent x402 for LP Scout access, not manual human-to-agent tipping.
- Main Hash PayLink Agent wallet should not require the user to sign into the platform wallet.
- For LP Scout, a paying user selects/authorizes their own linked agent wallet to pay Hash PayLink Agent via x402.
- Keep UI consumer-friendly, fintech-like, compact, and uniform with Hash PayLink sections.
- Avoid oversized cards, cluttered result blocks, and inconsistent icons.
- For World Cup News, provider/news content is context. LP Scout is the paid flow for market/actionable research.
- Poly Stream later must use official/legal streaming APIs or approved external links only. Do not scrape or embed illegal streams.

## Next Task

Scan the Telegram/Photon bot flow and add Polymarket commands that open exact Hash PayLink modals:

```text
/lpscout    -> https://hashpaylink.com/telegram/payment-links?section=market-tools&service=lp-scout&open=1
/polynews   -> https://hashpaylink.com/telegram/payment-links?section=market-tools&service=poly-worldcup-news&open=1
/polymarket -> https://hashpaylink.com/telegram/payment-links?section=market-tools&open=1
```

Before editing, verify the actual bot repo/folder and command routing. Do not guess.

## Suggested Follow-Up After Telegram Commands

Audit Poly Stream separately:

- find a legal/official data or streaming source,
- design compact match cards,
- separate stream/watch links from news,
- keep it under Polymarket or World Cup tooling only if it adds clear value.

## Restart Instruction For Future Codex Session

If this desktop or session closes, reopen Codex in the repo and say:

```text
Read AGENT_HANDOFF.md and continue from the next task.
```
