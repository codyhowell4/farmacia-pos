-- ============================================================
-- CONSENT DOCUMENTS: allow customers to insert their own
-- signed standard documents (consent-onboarding gate)
-- ============================================================
-- The customer app requires every signed-in user to accept the
-- three standard documents (privacidad, general, teleconsulta)
-- before using the app. FarmaciaAPI.acceptConsentDocuments
-- INSERTs one row per document with status 'signed'. Existing
-- RLS only grants customers SELECT/UPDATE on their own rows
-- (see MIGRATION_consent_customer_sign.sql), so this policy
-- adds the INSERT path needed for the onboarding signatures
-- to persist.
--
-- Scope stays narrow: a customer can only INSERT rows whose
-- customer_id belongs to their own customers record
-- (customers.profile_id = auth.uid()).
-- ============================================================

create policy consent_documents_customer_insert
  on consent_documents
  for insert
  with check (customer_id in (select id from customers where profile_id = auth.uid()));

-- VERIFICATION (uncomment to run after migrating):
-- select policyname, cmd from pg_policies
--  where tablename = 'consent_documents' and policyname = 'consent_documents_customer_insert';
