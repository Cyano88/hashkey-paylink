# Smile ID presentation shell

Upstream: https://cdn.smileidentity.com/inline/v1/biometric-kyc.html
Source project: https://github.com/smileidentity/web-client (MIT; see LICENSE).
Captured 2026-09-21. Original HTML SHA-256: 5d518b5792a88bd4e94839198a810dd466bae0e05faa93486baffbde62043154.

Relative asset URLs and presentation styles are changed. A small presentation-only
script applies neutral input styles inside Smile's open consent shadow roots. Smile's scripts,
consent wording, fields, capture, upload and provider APIs are unchanged.
The HTML is served only on the API origin, separate from Pocket's app origin.
Configuration arrives through a source/origin-checked parent bridge; no tokens
are put into URLs or HTML. Never serve this shell on the Pocket app origin.

Document shell: https://cdn.smileidentity.com/inline/v1/doc-verification.html
Captured 2026-09-22. Upstream SHA-256: 505d54c553a4b44142471bc14f00bcf25f26ae29342f95697e6bd5a5160550b0.
The document shell uses the same flat, scrollable Pocket frame and unchanged provider capture scripts.
