# Pocket Support conversation polish - 2026-10-02

## Changes
- Bank missing-payment flow offers owned bank records first, then narrows by original amount/currency/network and relative minutes/hours/days. Relative timestamps are anchored to server time and retained across replies. ISO milliseconds now parse correctly; approximate hour matches use a 30-minute window.
- XPay/collection replies use readable amounts and dates without raw ISO timestamps, repeated configuration metadata or duplicate recorded timestamps. Saved evidence remains explicit.
- New human handoffs produce one acknowledgement and use the existing waiting panel. Existing historical messages are retained.
- Staff replies and resolution prompts use the existing private bell/push service and case deep link. Automatic reminders/closures also publish support updates when lifecycle advancement runs. Notification bodies omit private chat contents. Notification failure does not discard the saved staff reply.

## Verification
- Real handler tests: staff identity, owner-bound notification, case deep link, unread/read, resolution Yes/No, cross-account denial, closed-case protection, push failure and automatic closure.
- Lifecycle tests: ordinary deadlines, protected money cases remain open, unanswered human cases escalate rather than disappear.
- Conversation, feature-adapter and investigation regressions pass, including relative time and NGN/UGX separation.
- Strict targeted TypeScript diagnostics: zero.
- Physical push delivery is not claimed from mocked transport tests. Device presentation still depends on registration, provider delivery and notification permission.
