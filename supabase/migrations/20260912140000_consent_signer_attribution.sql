-- Strengthen e-signature attribution (Código de Comercio art. 1205):
-- capture the IP address and user agent alongside each consent signature.
alter table public.consent_documents
  add column if not exists signer_ip text,
  add column if not exists signer_user_agent text;
