# Pocket iOS release checklist

## Native application

- Product: Pocket by Hash PayLink
- Bundle ID: `com.hashpaylink.pocket`
- Display name: Pocket
- Minimum iOS: 15
- Device family: iPhone
- Orientation: portrait
- Privacy policy: https://pocket.hashpaylink.com/docs/privacy
- Terms: https://pocket.hashpaylink.com/docs/terms
- Account deletion: https://pocket.hashpaylink.com/docs/account-deletion
- Support: https://pocket.hashpaylink.com/docs/support

## Apple account setup

1. Enroll in the Apple Developer Program.
2. Create the explicit App ID `com.hashpaylink.pocket`.
3. Enable Push Notifications and Associated Domains.
4. Create the Pocket app record in App Store Connect.
5. Create a dedicated App Store Connect API key with App Manager access for the macOS CI service.
6. Add the iPhone tester's Apple Account as an internal TestFlight tester.

Do not paste or commit any `.p8`, signing certificate, provisioning profile, password, or private key.

## Production environment

Configure these directly in Render:

- `APPLE_TEAM_ID`: ten-character Apple Developer Team ID.
- `APPLE_APNS_KEY_ID`: ten-character Apple Push Notification key ID.
- `APPLE_APNS_PRIVATE_KEY`: complete APNs `.p8` private-key contents.
- `APPLE_APNS_TOPIC=com.hashpaylink.pocket` (optional because this is the default).

Android continues to use `FIREBASE_SERVICE_ACCOUNT_JSON`. iOS uses APNs directly.

After deployment, verify:

- `https://pocket.hashpaylink.com/.well-known/apple-app-site-association` returns HTTP 200 and the correct Team ID plus bundle ID.
- A TestFlight device registers with platform `ios`.
- Foreground, background, and locked-screen pushes arrive.
- Tapping a push opens only an allowed Pocket destination.

## macOS CI

The Windows preparation command is:

```powershell
$env:VITE_POCKET_PUSH_ENABLED='true'
npm.cmd run mobile:ios:sync
```

The macOS runner must:

1. Check out the exact release commit.
2. Install the lockfile with `npm ci`.
3. Set `VITE_POCKET_PUSH_ENABLED=true`.
4. Run `npm run mobile:ios:sync`.
5. Resolve Swift packages.
6. Apply Apple signing with the App Store distribution profile.
7. Archive `ios/App/App.xcodeproj` using scheme `App`.
8. Export the signed IPA.
9. Upload it to App Store Connect and TestFlight.

## iPhone 17 Pro TestFlight gate

- Fresh install and first sign-in.
- Returning launch with Face ID enabled and disabled.
- Circle wallet sign-in/session recovery.
- Base, Solana, and Arbitrum balances and sends.
- Payment requests: create, accept, pay, update, and receipt.
- Bank payout: prepare, fund, submit, success/pending/reversed states.
- Bills in read-only or enabled release scope.
- Activity cold load and pull-to-refresh.
- Native back swipe and modal cancellation.
- Keyboard on every amount, PIN, OTP, bank search, and support form.
- No content under the Dynamic Island, status bar, or home indicator.
- Light/dark theme transitions after authentication.
- Push while foregrounded, backgrounded, and locked.
- Universal link and `pocket://` deep link.
- Offline launch/recovery and relaunch during an in-flight payment.
- Account deletion from Profile and the public deletion page.

Do not submit for App Review until all money-movement tests are reconciled against server activity and receipts.
