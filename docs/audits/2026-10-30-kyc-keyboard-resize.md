# Pixel KYC keyboard resize - 2026-10-30

## Observed
- Earlier input trace: IME dismissed shortly after input; focused input remained connected. The dismissal was intermittent and was not reproduced by subsequent direct touchscreen tests.
- Reproduced native Android geometry bug on Pixel 10 Pro: layout viewport 618px, transient visual viewport 284.67px, verification iframe 180.67px; settled iframe 514px. Before keyboard: 952px layout viewport / 848px iframe.
- Native Android already resizes the WebView for the IME. Applying the transient visual viewport height subtracts keyboard space twice.

## Change
- `protectSmileViewport` uses the layout viewport height and zero visual offset on native Android only. Web and iOS retain visual viewport height and offset.
- Same minimal source change applied to the native bridge worktree.
- Applied compiled helper to active Pixel session without navigating, submitting, or modifying consent. Original test field values restored.

## Checks
- New browser smoke: native transient height, settled height, keyboard close, cleanup; web and iOS behavior preserved.
- Existing Smile frame browser smoke passes origin/source checks, submission results, cancellation and cleanup.
- Pixel: first-character test in three fields, then nine touchscreen key taps across given names, surname and email; IME remained open and inputs remained focused.

## Limit
The double-resize defect is confirmed. Its causal connection to every reported intermittent keyboard dismissal is not yet proven. Do not describe a provider/identity verification submission as tested or approved.
