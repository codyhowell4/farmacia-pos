-- ============================================================
-- CONSENT DOCUMENTS: allow customers to sign their own documents
-- ============================================================
-- The customer portal lets patients sign pending consent
-- documents (FarmaciaAPI.signConsentDocument updates status,
-- signer_name and signed_at). Existing RLS only grants customers
-- SELECT on their own rows, so this policy adds the UPDATE path
-- needed for the signature to persist.
--
-- Scope stays narrow: a customer can only UPDATE rows whose
-- customer_id belongs to their own customers record
-- (customers.profile_id = auth.uid()).
-- ============================================================

create policy consent_documents_customer_sign
  on consent_documents
  for update
  using (customer_id in (select id from customers where profile_id = auth.uid()))
  with check (customer_id in (select id from customers where profile_id = auth.uid()));

-- VERIFICATION (uncomment to run after migrating):
-- select policyname, cmd from pg_policies
--  where tablename = 'consent_documents' and policyname = 'consent_documents_customer_sign';
