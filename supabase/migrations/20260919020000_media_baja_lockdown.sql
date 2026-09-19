-- ============================================================================
-- Round-2 audit: MEDIA/BAJA lockdown — apply ONLY AFTER the frontend deploy.
-- R2-31: customers no longer insert consent rows directly; signing goes
-- through the security-definer sign_consent_documents RPC (server-stamped
-- type whitelist, signed_at, created_by, content hash). Staff and service
-- role flows are unaffected (staff ALL policy + service role bypass).
-- ============================================================================

drop policy if exists consent_documents_customer_insert on public.consent_documents;
