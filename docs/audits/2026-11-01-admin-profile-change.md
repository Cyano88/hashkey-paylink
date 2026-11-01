# Admin app profile type correction

Scope: move one existing app between the same owner's completed Personal and
Business profiles. No duplicate app and no ownership transfer. The builder
creates/completes the destination profile; staff cannot fabricate that identity.

Owner or explicitly assigned Compliance access is required, including for the
destination list. Workspace scope is enforced. Ordinary builders, support,
engineering, administrator and legacy section-only grants cannot use the action.

The move checks the last-read update timestamp, requires a reason and explicit
pause acknowledgement, and atomically changes the project association/type/country.
It retains keys, destinations, webhook secrets and project/order identifiers.
No order, receipt, sibling app or profile record is rewritten. Previous encrypted
verification and document references remain in the private profileChanges archive.
Verification revision increases to invalidate stale draft/review requests.

The project is suspended with routing review required. KYC/KYB approval is cleared,
bank verification is invalidated, public-directory visibility is disabled and any
Arc pilot approval is disabled. Previous suspension reasons remain recorded.
Owner/Compliance must review the new identity, receiving setup and any earlier
restrictions before reactivating. NG business human checkout requests then require
NGN pricing. This action never itself approves KYC, KYB or a payment route.

Validation: handler fixtures cover both directions, unchanged sibling apps and
credentials, private evidence retention, stale submissions, role boundaries and
payment suspension. Browser checks use the real component with fixture responses;
no real builder app is moved as part of testing.
