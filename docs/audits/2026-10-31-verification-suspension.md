# Payment suspension from business verification — 2026-10-31

Business verification now exposes the existing per-app operational suspension control. The Payment access section is separate from KYB status. Staff must enter a reason, review the consequence, then explicitly confirm suspension or lifting it. Cancelling sends no mutation. Only existing authorized Owner/Compliance operations can succeed server-side.

Uses existing admin-suspend/admin-reactivate handlers; no automatic action based on report count. Suspension prevents new checkout authorization without deleting keys, project configuration, KYB evidence or history. Lifting a suspension does not bypass other production gates. This is not government licence revocation or business-wide enforcement across every app.

The reviewer-only read response includes access status and suspension/reactivation audit history. Public builder verification reads do not receive staff history.

Verified with developer verification and project-adapter smoke tests (suspension gating, preserved keys/KYB, restoration, actor/reason history and workspace permissions), synthetic Playwright confirmation/cancel/suspend/lift/history checks, and full TypeScript check. No live project was suspended during testing.
