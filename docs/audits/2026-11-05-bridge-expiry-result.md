# X Layer bridge quote expiry and disappearing result - 2026-11-05

## Verified incident
Operation 0a84619f-bd88-4099-9877-6d6d881cd110 was X Layer USDT to Base USDC, input 4.054557 USDT. It was prepared at 06:05:30.677 UTC, its signed quote expired at 06:05:46 UTC, and the server marked it cancelled at 06:05:48.392 UTC. No source hash, provider transaction ID or user-operation hash exists on this record. A read-only source balance check returned 4.064566 USDT after the incident.

The app saved processing before the submit call. If submission failed before atomic dispatch, recovery read `status` while the operation was still prepared. That endpoint cancelled prepared operations. The Swap page's cancelled-operation listener then cleared the active bridge and remounted the panel, removing the review without showing an outcome. The original submit error was not persisted, so its exact text is unavailable; the recorded expiry is consistent with an expired submit.

## Fix
- Status checks no longer mutate prepared operations. Only explicit cancellation can release a prepared attempt; expired unsigned reservations already stop blocking via the reservation guard.
- Use the existing 20-second review budget before execution, then require at least five seconds remaining after preparation and after authorization. Aging preparations are cancelled without dispatch and a fresh review is required. Never extend the signed quote expiry.
- After a submit error, read status. If still prepared, explicitly and atomically cancel; only a proved cancelled/not-submitted result is shown as not sent. Unknown or submitted results remain tracked. No automatic re-dispatch.
- Preserve submission error with the operation. Remove automatic page reset for cancelled/not-submitted operations. Show a terminal Bridge not sent sheet until Done, provided no submission evidence conflicts.
- Before source evidence or completed approval, the progress label is Confirming bridge, not Bridging.

## Validation
Backend API and operation fixtures passed: status read-only, cancellation, provider-response loss, owner binding and one-dispatch invariants. Native browser harness now includes X Layer, lost-submit followed by proven cancellation, visible result until Done, and quote aging during preparation with no authorization or submit. Existing Base, BNB, Solana stable/native, Polygon and Arc scenarios retained. Progress-sheet tests include cancelled and not-submitted outcomes. No funded transfer or signature was executed by the agent.

Backend runtime commit: 5eb126208d914f8fa65111b06d94292ee4777054. Deploy: dep-dbm1t961egvs73b2vmrg. Native artifact details will be appended after installation.

## Release
Render deploy is live and health returned HTTP 200. Installed `pocket-bridge-expiry-20261105.apk` on Pixel serial 5A160DLCH006VM with app data preserved. SHA-256 `D9B470C130CF6F9BC0273EB0AF9DD0E3AFBA30AEB3762CAC2FA0D3A575D68891`; all 1,868 packaged assets match dist. Source/test snapshot: `C:/Users/USER/pocket-play-update-20261101/native-release/bridge-expiry-source-20261105.zip`. Regression results are fixtures, not a funded live bridge. No new bridge was sent. Device was being used in other apps; no unrelated UI was inspected during this incident investigation.
