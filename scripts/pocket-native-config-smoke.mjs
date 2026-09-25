import assert from 'node:assert/strict';import {loadConfigFromFile} from 'vite';
for(const name of ['VITE_PRIVY_APP_ID','VITE_AUTH_BRIDGE','VITE_CIRCLE_USER_WALLET_APP_ID'])delete process.env[name];
await assert.rejects(loadConfigFromFile({command:'build',mode:'pocket-native'},'vite.config.ts'),/requires production Privy\/Circle/);
console.log('PASS native packaging rejects missing authentication configuration.');
