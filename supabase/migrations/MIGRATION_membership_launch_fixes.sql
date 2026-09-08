-- ============================================================
-- Membership launch fixes
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Allow 'paypal' as a payment method.
-- PayPal signups store payment_method = 'paypal'; the original constraint
-- only allowed ('card', 'cash'), which rejected every PayPal signup.
alter table memberships
  drop constraint if exists memberships_payment_method_check;
alter table memberships
  add constraint memberships_payment_method_check
    check (payment_method in ('card', 'cash', 'paypal'));

-- 2. Cash memberships are not PayPal-processed.
-- Staff cash registrations were mislabeled payment_processor = 'paypal',
-- which made processMembershipRenewals skip them forever. Clear the
-- processor on cash rows that have no real PayPal subscription.
update memberships
set payment_processor = null,
    updated_at = now()
where payment_method = 'cash'
  and payment_processor = 'paypal'
  and processor_subscription_id is null;
