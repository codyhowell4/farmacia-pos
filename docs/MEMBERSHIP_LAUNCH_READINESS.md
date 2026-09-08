# Membership Launch Readiness

Audit date: 2026-05-21. Scope: full membership flow (public signup, staff registration, PayPal billing, POS benefits, customer app, renewals).

**Verdict:** the happy paths work (signup → PayPal → activation → portal account → POS discount/visits/trackers → admin management), but there are **6 launch blockers** — two of them lose money (free memberships, unbilled upsells) and one silently breaks the core promise of the plan (monthly visits never renew for PayPal members).

---

## 1. What exists today (verified working per code)

- Public self-signup at `/membresias` (`src/pages/MembershipPublicPage.jsx`) — plan pick → form → PayPal subscription → activation via `paypal-subscription` edge function (verifies subscription with PayPal, dedupes by email/phone, reinstates cancelled memberships, provisions the customer-app login).
- Staff registration at `/admin/membership-register` (`src/components/admin/MembershipRegistration.jsx`) — cash or PayPal, family members, tracker counts.
- Admin management at `/admin/memberships` (`src/components/admin/AdminMemberships.jsx`) — list/search/edit, PayPal status sync (suspend/activate/cancel), manual "Procesar renovaciones".
- POS integration (`src/pages/PoSDashboard.jsx`, `src/components/MembershipPosLookup.jsx`) — lookup by ID/name/phone/email, 10% discount on products, free included consults then 50% off, visit decrements, basic tracker fulfillment.
- Customer app (`public/customer-app/`) — Membresías tab with status card, paid-tier page gating, member pricing on video consults, login by membership number (APOLO-00001).
- Webhook (`supabase/functions/paypal-webhook/index.ts`) — dedup via `paypal_webhook_events`, handles activate/fail/cancel events.

---

## 2. Launch blockers (fix before taking real money)

### B1. PayPal members never get their visits renewed
Two stacked bugs:
- The webhook's renewal handler (`PAYMENT.SALE.COMPLETED`) only updates status/dates — it **never resets `visits_remaining`** (`supabase/functions/paypal-webhook/index.ts:167-171`).
- Worse, `getSubscriptionId` reads `resource.id` (`paypal-webhook/index.ts:25-29`), which for a sale event is the **sale** ID, not the subscription ID (that lives in `resource.billing_agreement_id`). The update matches 0 rows, so even `next_renewal_date` never advances past month 1.

Meanwhile `processMembershipRenewals` explicitly **skips** PayPal rows because "webhooks handle it" (`src/lib/db.js:2575-2578`). Net effect: a PayPal member gets their 2/8 visits **once, forever**; from month 2 they silently have 0 included consults.

**Fix:** in the webhook, read `billing_agreement_id` for sale events and reset `visits_remaining = visits_limit` (and advance `next_renewal_date`) on `PAYMENT.SALE.COMPLETED`.

### B2. `payment_method = 'paypal'` violates the DB constraint — every PayPal signup may fail
The table constraint allows only `('card', 'cash')` (`supabase/migrations/MIGRATION_membership_system.sql:53`), but the edge function sends `payment_method: 'paypal'` (`supabase/functions/paypal-subscription/index.ts:157`) and so does the staff flow (`MembershipRegistration.jsx:250`). No migration adds `'paypal'`.

**Fix/verify:** run `select payment_method, count(*) from memberships group by 1;` in the SQL editor. If PayPal signups exist, someone hand-altered the constraint — record that fix in `supabase/fixes/`. If none exist, add the constraint fix migration **before** the first signup attempt. (If public signup was never successfully tested against the live DB, assume it's broken.)

### B3. Anyone on the internet can create a free active membership
`paypal-subscription` skips **all** PayPal verification when `payment_method === 'cash'` (`index.ts:321,335`), and the function is unauthenticated (`verify_jwt = false`, `supabase/config.toml`). A single curl with `payment_method: 'cash'` creates an active membership with full visits and 10% discount. No frontend sends this — it's pure attack surface.

**Fix:** remove the cash branch from the edge function (staff cash registration already goes through `createMembership` in `src/lib/db.js`, which is behind staff auth).

### B4. Webhook has no signature verification
`paypal-webhook` never calls PayPal's `verify-webhook-signature` and has no `PAYPAL_WEBHOOK_ID` env. Anyone who finds the URL can forge events to pause/cancel/reactivate any membership, or poison the dedup table to block real events.

**Fix:** implement signature verification with a `PAYPAL_WEBHOOK_ID` secret before launch.

### B5. `paypal-subscription-status` is unauthenticated
Anyone who learns a subscription ID (visible in admin UI, sent in webhook payloads) can suspend or cancel a **real PayPal subscription** (`supabase/config.toml:9-10`, called from `AdminMemberships.jsx:13-38` with no token).

**Fix:** require staff auth (verify JWT + org role) in this function.

### B6. Staff cash memberships are mislabeled `payment_processor: 'paypal'`
`MembershipRegistration.jsx:145`. Consequence: `processMembershipRenewals` skips them (`db.js:2575-2578`), so cash members never flip to `pending_payment` and their visits never renew either.

**Fix:** store `payment_processor: null` (or add `'cash'` to the constraint) for cash memberships, and fix existing rows.

---

## 3. Important gaps (launch works without them, but they hurt)

**Money / accounting**
- **Premium tracker upgrade (+$250) is displayed but never billed.** The PayPal button only creates the fixed-price plan subscription (`src/lib/paypal.js:88`); the edge function stores only `plan.price`; the cash path shows the higher total but creates no sale/receipt. Customers are promised a premium tracker nobody charged them for.
- **No membership revenue hits the books.** Signups and renewals create no `sales`/payment rows — invisible to POS reports and the accounting sync.
- Cash `pending_payment` renewals have **no "collect payment" button** — staff must hand-edit status and `visits_remaining`.

**Retention / operations**
- **No scheduled renewal job.** Renewals process only when someone opens the POS or clicks the admin button (the only pg_cron job is appointment auto-cancel). Cash memberships need a daily cron or a documented manual routine.
- **No dunning.** Failed PayPal payment → silently `paused`, forever. Nothing ever sets `expired`; no grace period, no retry, no "update your card" message.
- **No notifications.** No welcome email/WhatsApp, no renewal receipt, no payment-failed alert (`send-notifications` only does appointments).
- **Webhook SUSPENDED → cancelled** locally, but admin "Pausado" → PayPal `suspend` — asymmetric round-trip: pausing a membership can later cancel it via webhook echo.
- Duplicate webhook events return HTTP 400 → PayPal keeps retrying already-processed events. Return 200 for dupes.
- Activation accepted on `APPROVED`/`APPROVAL_PENDING` — membership goes live before the first payment clears.
- Basic trackers are not decremented at signup (edge-function `fulfillTrackers` is defined but never called); fulfillment is manual via the POS button.

**Customer experience**
- **No self-serve cancel or payment-method update** anywhere customer-facing — members must contact the pharmacy (note: PROFECO generally expects a straightforward cancellation path for recurring charges; get this on the roadmap even if launch is phone-only).
- **Lapsed members silently drop to the free tier** — `getMembershipDetails` only matches `status='active'` (`public/customer-app/js/api.js:782`); no "your payment failed" state.
- **The 10% discount does not apply to in-app online orders** — `placeOrder` charges full price (`api.js:945-1001`); the discount only exists at the POS.
- **Family members are invisible** in the customer app after signup.
- **No membership terms/contract or cancellation-policy text** anywhere (the consent system is medical NOM-004 paperwork, unrelated). Add a terms checkbox at signup.
- `/membresias` is not linked from the homepage or `llms.txt` — only from inside the customer app.

**Maintainability**
- Plan catalog is **hardcoded in 4 places**: `MembershipRegistration.jsx:13-44`, `MembershipPublicPage.jsx:10-40`, `paypal-subscription/index.ts:31-34`, `public/customer-app/js/app.js:1085-1097` — plus the PayPal dashboard plans. Any price change = 5 edits. Current values: Individual $150/mes (2 visitas), Familiar $500/mes (8 visitas), 10% descuento, trackers 1/6, +$250 premium upgrade, +$50 cash surcharge, consult $100.
- `searchMemberships` fetches the whole table and filters in JS (`db.js:2664-2690`) — fine at launch scale.
- Dead config: `.env.example` still advertises Openpay/Stripe; `src/lib/openpay.js` has no importers.

---

## 4. Operational setup checklist (manual, outside the repo)

**Database (Supabase SQL editor)**
- [ ] Confirm applied: `MIGRATION_membership_system.sql`, `MIGRATION_paypal_memberships.sql`, `MIGRATION_telehealth.sql`, `MIGRATION_customer_portal_auth.sql`.
- [ ] Verify/fix the `payment_method` check constraint (see B2).
- [ ] Fix mislabeled cash rows: `update memberships set payment_processor = null where payment_method = 'cash';` (after B6 code fix).

**PayPal (developer dashboard)**
- [ ] Create the **live** app; generate client ID + secret.
- [ ] Create the two billing plans (Individual $150 MXN/mes, Familiar $500 MXN/mes) — prices must match the hardcoded catalog.
- [ ] Register webhook `https://ieinjhonepkudxxpmuly.supabase.co/functions/v1/paypal-webhook` for: `BILLING.SUBSCRIPTION.ACTIVATED`, `RE-ACTIVATED`, `CANCELLED`, `SUSPENDED`, `PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED`. Save the webhook ID for B4.
- [ ] Decide activation policy on `APPROVAL_PENDING` (PayPal plan setting + edge-function behavior).

**Edge-function secrets (Supabase dashboard)**
- [ ] `PAYPAL_ENV=live`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_PLAN_INDIVIDUAL`, `PAYPAL_PLAN_FAMILIAR`, `PAYPAL_WEBHOOK_ID` (once B4 lands).

**Frontend env (Vercel)**
- [ ] `VITE_PAYPAL_ENV=live`, `VITE_PAYPAL_CLIENT_ID`, `VITE_PAYPAL_PLAN_INDIVIDUAL`, `VITE_PAYPAL_PLAN_FAMILIAR`, `VITE_PUBLIC_ORG_ID=718f51b5-dc67-4f70-8aa9-1a315cd1deeb`.
- [ ] **Easy to miss:** the PayPal client ID is also hardcoded in `public/customer-app/js/supabase.js:20` (consult payments) — switch it to the live ID too.

**End-to-end test before announcing**
- [ ] Sandbox: full public signup → login to customer app → book membership consult (visits decrement) → simulate renewal webhook (visits reset) → cancel from admin (PayPal + local status).
- [ ] Live: one real signup with a staff/card on file, verify webhook fires and the renewal date is correct, then cancel/refund from PayPal.
- [ ] Cash: staff registration → POS discount → manual renewal processing → collection workflow walkthrough.

---

## 5. Post-launch roadmap (not blockers)

1. Customer self-service: cancel, card update (PayPal subscription revise link), payment-failed state in the app.
2. In-app member discount on online orders; plan-change (upgrade/downgrade) flow.
3. Membership notifications: welcome, renewal receipt, payment-failed, visit-reset monthly summary (extend `send-notifications`).
4. Terms & cancellation policy acceptance at signup; store acceptance like consent documents.
5. Move plan catalog to a DB table; surface plan management in admin.
6. Refund handling (`PAYMENT.SALE.REFUNDED`), proration policy, per-member visit tracking on family plans, payment/visit history views.
7. Daily pg_cron for renewals/expiry instead of POS-mount processing.

---

## 6. Suggested order of operations

1. Fix B1–B6 (one PR; mostly webhook + edge-function changes plus one migration).
2. Run the §4 checklist (PayPal live setup, secrets, Vercel env, constraint verification).
3. Sandbox E2E test, then one live real-money test.
4. Add terms checkbox + welcome notification (can be same week).
5. Announce.
