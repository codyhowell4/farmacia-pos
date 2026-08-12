-- ============================================================
-- PHASE 2 MIGRATION: Extend prescriptions table for doctor prescriptions
-- ============================================================

-- 1. Add clinical prescription fields
ALTER TABLE prescriptions 
  ADD COLUMN IF NOT EXISTS medication text,
  ADD COLUMN IF NOT EXISTS dosage text,
  ADD COLUMN IF NOT EXISTS frequency text,
  ADD COLUMN IF NOT EXISTS duration text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' 
    CHECK (status IN ('active','fulfilled','expired','cancelled')),
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;

-- 2. Drop strict UNIQUE on sale_id (allow multiple prescriptions without sales)
-- Use partial unique index to preserve COFEPRIS 1:1 for sale-linked records
DROP INDEX IF EXISTS idx_prescriptions_sale_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_sale_unique 
  ON prescriptions(sale_id) WHERE sale_id IS NOT NULL;

-- 3. Add searchable indexes
CREATE INDEX IF NOT EXISTS idx_prescriptions_number ON prescriptions(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id) WHERE doctor_id IS NOT NULL;

-- 4. Add RLS policy for doctors to create/update their own prescriptions
DROP POLICY IF EXISTS "doctor_prescriptions_insert" ON prescriptions;
CREATE POLICY "doctor_prescriptions_insert" ON prescriptions
  FOR INSERT WITH CHECK (
    doctor_id = auth.uid() 
    AND org_id = get_my_org_id()
  );

DROP POLICY IF EXISTS "doctor_prescriptions_update_own" ON prescriptions;
CREATE POLICY "doctor_prescriptions_update_own" ON prescriptions
  FOR UPDATE USING (
    doctor_id = auth.uid() 
    AND org_id = get_my_org_id()
  );

-- 5. Add RLS policy for doctors to read prescriptions they created or for their org
DROP POLICY IF EXISTS "doctor_prescriptions_read_own" ON prescriptions;
CREATE POLICY "doctor_prescriptions_read_own" ON prescriptions
  FOR SELECT USING (
    org_id = get_my_org_id()
  );

-- 6. Verify inventory has supplier_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'inventory' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE inventory ADD COLUMN supplier_id uuid REFERENCES suppliers(id);
  END IF;
END $$;
