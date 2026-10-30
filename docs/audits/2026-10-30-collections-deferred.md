# Collections deferred — 2026-10-30

Product correction from the user: Collections is rolled down for now because it conflicts with Request; it may be enabled later. This supersedes the earlier audit's recommendation to restore Collections and investigate a missing native entry point. Do not pursue native Collections activation as an outstanding task.

Removed the Collections guide, sidebar link and overview entry. Reconnected adjacent guide navigation. Existing /docs/pocket/collections bookmarks redirect to Send, receive and request. Request remains the current user-facing flow. No app, payment, historical records or backend changes are included.
- Verified: local Playwright passed all 21 pages at mobile/desktop sizes and both themes. Deployment dep-dbi2uik9v7es738i3960 is live at commit 0b8592b23415fa0e6b50cfbb74052cd47c948da7. Live Playwright passed 21 routes, no Collections navigation, redirect to Request guide, logo decode and no overflow/page errors.
