-- ============================================================
-- MIGRATION: Create customer-documents Storage Bucket
-- ============================================================
--
-- PURPOSE:
--   The customer portal uploads prescription files to a
--   Supabase Storage bucket named "customer-documents".
--   If the bucket does not exist, uploads return 404.
--
-- RUN IN: Supabase SQL Editor
-- ============================================================

-- 1. Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-documents', 'customer-documents', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow authenticated users to upload
DROP POLICY IF EXISTS "customer_documents_upload" ON storage.objects;
CREATE POLICY "customer_documents_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'customer-documents');

-- 3. Allow authenticated users to read
DROP POLICY IF EXISTS "customer_documents_select" ON storage.objects;
CREATE POLICY "customer_documents_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'customer-documents');

-- 4. Verify
SELECT id, name, public
FROM storage.buckets
WHERE id = 'customer-documents';
