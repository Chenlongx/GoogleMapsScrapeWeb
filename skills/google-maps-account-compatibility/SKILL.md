---
name: google-maps-account-compatibility
description: Preserve legacy Google Maps Scraper account lifecycle compatibility across checkout, registration, renewal, login, and export logic. Use when modifying `user_accounts`, payment callbacks, checkout flows, renewal APIs, or trial/formal account transitions in `GoogleMapsScrapeWeb`.
---

# Google Maps Account Compatibility

Preserve old client behavior before changing account or payment code.

## Invariants

- Treat `standard` as the legacy trial account type.
- Treat both `standard` and `trial` as trial users when checking limits or UI restrictions.
- Treat `regular` and above as formal paid users.
- Do not assume registration creates `trial`; current legacy registration creates `standard`.
- Do not change renewal success payloads without checking old desktop client expectations.

## Required Checks

When touching checkout, payment, renewal, or `user_accounts`, inspect these files first:

- `netlify/functions/verify-and-register.js`
- `netlify/functions/business-logic.js`
- `netlify/functions/checkPaymentStatus.js`
- `netlify/functions/check-account-status.js`
- `netlify/functions/receivingClient.js`
- `netlify/functions/recordExport.js`

If the change affects legacy desktop compatibility, also inspect:

- `D:/gogole_maps_private/Maps_scraper.py`
- `D:/gogole_maps_private/renewal_dialog.py`

## Compatibility Rules

### Registration

- Legacy registration currently writes `user_type: 'standard'`.
- Any migration away from `standard` must keep read-path compatibility for existing customers.

### New Purchase Upgrade

- A paid checkout may arrive for an already-registered trial account.
- Never blindly `insert` by email/account on payment success.
- Query existing `user_accounts` first.
- If the account exists, upgrade it in place and reset trial restrictions.
- Only create a new account when no matching account exists.

### Renewal

- Renewal must return the actual post-payment `userType` and `newExpiryDate`.
- Old desktop clients may default to `premium` if `userType` is omitted, so always return it explicitly.
- When extending validity, extend from the later of `now` and current `expiry_at`.

### Export And Trial Limits

- Export limit logic must include both `standard` and `trial` as trial-tier users.
- Do not leave `standard` unmapped in limit tables.

## Safe Defaults

- Legacy trial: `standard`
- Legacy formal paid: `regular`
- Reset on upgrade:
- `trial_search_used = false`
- `daily_export_count = 0`
- `last_export_date = null`

## Validation

- Run `node --check` on every modified Netlify function.
- Review diffs for payment success payload shape changes.
- If account lifecycle behavior changed, test:
- register a new user
- pay for an already-registered trial email
- renew an expired legacy account
- log in from the old desktop client
