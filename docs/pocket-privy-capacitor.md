# Pocket Privy mobile and web configuration

Verified from source on 2026-09-16. Pocket already uses the Privy React SDK inside Capacitor, with email-only authentication. Keep the same Privy app and backend user IDs across platforms. Circle handles wallet signing separately.

## Dashboard origins to verify

- Pocket web: https://pocket.hashpaylink.com
- Hash PayLink web and configured Android WebView: https://app.hashpaylink.com
- Configured iOS WebView (default iOS scheme): capacitor://app.hashpaylink.com

Confirm actual origins on installed release builds. This project overrides Capacitor's default localhost hostname. Do not change the hostname casually: browser storage and sessions depend on it. Privy app secrets remain server-side.

## Email versus social authentication

Email OTP already uses the shared PrivyProvider in src/main.tsx. Privy's Capacitor guide explicitly says email/SMS do not require the additional OAuth redirect listener. No React Native SDK replacement is needed.

If Google or Apple OAuth is introduced, add a native-browser integration and a dedicated validated HTTPS callback handler before Privy initializes, handling both warm and cold launches. Preserve ordinary Pocket navigation. Configure the exact redirect and providers in Privy. The pocket:// scheme is not a substitute for verified HTTPS OAuth links.

Android App Links and iOS Associated Domains already reference pocket.hashpaylink.com. Server association endpoints use ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS and APPLE_TEAM_ID. Their live responses and installed-app associations still need verification.

## Release checks

Test email OTP, logout, session expiry, offline resume, account switching and recovery on physical Android/iOS devices and web. Confirm each platform resolves to the same backend owner and existing Circle wallets. Dashboard configuration and live device authentication were not verified in this source review. No authentication runtime changes were necessary for current email-only login.

Reference: https://docs.privy.io/recipes/capacitor-oauth
