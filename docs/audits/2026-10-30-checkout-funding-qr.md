# Checkout wallet funding QR - 2026-10-30

- Observed active Chrome checkout chkx_48e1aebe24fb43d28de481b2 Add USDT panel: X Layer, wallet 0xE292801Ff95620ae2749B8C71A9EABB51E77e851. Its QR was generated from address alone, with network/asset only in surrounding text.
- Funding QR now encodes an explicit Pocket send URL with recipient, network, asset and address mode. Increased QR size from 120 to 160. Copy address stays a plain address. This remains wallet funding, separate from merchant checkout approval.
- Shared parser validates allowed origin/path, HTTPS, complete unique query fields, supported stablecoin/network and correct address format. No amount/approval is encoded. Wrong networks/assets and conflicting query fields are rejected.
- Main scanner, address-field scanner and explicit Paste accept the funding payload. Send route remounts on navigation so stale selected asset/network/address do not survive a new scan. BNB send form now reads recipient prefill.
- Unit matrix passes for supported USDC/USDT routes (Arc USDT rejected), malformed/hostile codes and preserved checkout parsing. Existing checkout/merchant authority and browser checkout checks pass.
- Browser test decodes the actual BrowserCheckoutCard QR, then feeds QR frames through actual main/address scanner decoders: exact send destination, camera stopped, no payment request. Native scanner fixture also passed.
- Web/native builds, Capacitor sync and Gradle assembly pass. Installed Pixel APK SHA256 10ed4624eb86bb18b0c8d225ab654f7fd32e0f7b801d93cec29fc7ce19e2c358.
- Real Pixel scan-handler navigation verified Base/USDC, BNB/USDT and X Layer/USDT: exact recipient, correct visible asset/network, blank amount and disabled Continue. No transfer submitted. This was payload entry into the real scan handler; physical phone camera scanning the monitor was not claimed. Browser camera decoder tests used rendered QR frames.
- Source 2e4b9af82461e7dca91a87928a914b7f125f8e16; deployment dep-dbi63pvb9u1s73dmnppg. Current Chrome checkout close to expiry during rollout; a fresh checkout is needed to exercise the newly deployed QR.
- Deployment confirmed live at 2026-10-30 09:28:36 UTC.
