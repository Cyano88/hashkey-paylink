# Smile ID presentation shell

Upstream: https://cdn.smileidentity.com/inline/v1/biometric-kyc.html
Source project: https://github.com/smileidentity/web-client (MIT; see LICENSE).
Captured 2026-09-21. Original HTML SHA-256: 5d518b5792a88bd4e94839198a810dd466bae0e05faa93486baffbde62043154.

Only relative asset URLs and presentation CSS are changed. Smile's scripts,
consent wording, fields, capture, upload and provider APIs are unchanged.
The HTML is served only on the API origin, separate from Pocket's app origin.
Configuration arrives through a source/origin-checked parent bridge; no tokens
are put into URLs or HTML. Never serve this shell on the Pocket app origin.
