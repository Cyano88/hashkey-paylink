# X Layer minimum fee price drift - 2026-11-05

Pixel screenshot `bridge-check-current.png` showed a retained Bridge not sent sheet for 3 USDT X Layer to Base USDC, with Bridge fee changed. Review again. behind it. This verifies the prior disappearing-sheet fix on the installed device.

Read-only journal inspection found operation 6e18d650-79ab-49d4-9244-a1935d00880e cancelled before dispatch: prepared 06:27:50.828 UTC, cancelled 06:27:58.808 UTC, quote expiry 06:28:11 UTC. This attempt was not stopped by expiry. No source transaction reference was recorded.

A read-only estimate of the saved charged batch returned in 1,488ms, with 27,813ms of cost validity remaining. The signed fee was 10,009 micro-USDT; the refreshed asset price (99,881,201 scaled by 1e8) moved the configured minimum to 10,012 micro-USDT. The old coverage field incorrectly used max(actual provider costs, newly converted minimum). That can reject a covered signed quote after a three-unit change in the minimum.

The coverage field now contains current network cost plus provider markup/allowance. Quote-time minimum and margin are still charged, current prices remain validated, gas/rent/allowance must be fully covered, maximum fee and wallet/balance checks remain. No signed fee, transaction total, provider route or expiry is changed. A fresh higher actual cost still requires review.

Validation: 26 asset/network reimbursement cases, 13 Circle quote/preflight cases and scoped TypeScript passed. Added regressions prove a minimum-only price move leaves an existing covered charge acceptable, new quotes still apply the new minimum, and an actual cost increase still rejects inadequate coverage. No transaction or wallet authorization was submitted by the agent.

Runtime commit 963ff277d83a13530debec97700a464683bb9bc7; Render deploy dep-dbm26l61egvs73b3uo20. Backend-only correction; installed Pixel APK remains pocket-bridge-expiry-20261105.apk.
