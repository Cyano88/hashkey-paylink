# Online/QR and Personal limit details

Pixel inspection confirmed two presentation gaps: Online/QR displayed only a static policy ceiling without ledger usage; Personal rendered one amount placeholder while showing raw provider capacity before account allowance loaded.

Both pages now use the same allowance presentation and complete amount/usage skeleton. Online/QR calls the authenticated, no-store `purchase_limits` read action and reports the shared checkout ledger's reserved USD amount, remaining allowance and Lagos reset. Bound, provider-confirmed bank refunds restore displayed allowance; ambiguous failures and wallet reservations stay counted. No payment execution or monetary policy changed. Personal combines capacity with remaining allowance only after that allowance is available; raw route capacity is no longer flashed as an available transfer amount.

Validation: direct Pixel before-state screenshots in `.codex-temp/pixel-online-loaded.png` and `pixel-personal-loading.png`; existing online/QR and personal enforcement fixtures passed; purchase usage fixtures cover mixed rails, quote values, confirmed refunds, unknown/failed outcomes, unverified accounts and Lagos reset; browser checks cover complete skeletons, live usage, badges, revocation and account isolation. Release and final device check recorded below.
