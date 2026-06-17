-- ============================================================
-- PHASE 4 COMPLETE MIGRATION
-- Fixes ALL missing columns and relationships for prescriptions,
-- doctor portal, customer height/weight, and RX number generation.
--
-- RUN THIS in Supabase SQL Editor before deploying Phase 4.
-- All operations are idempotent (safe to re-run).
-- ============================================================

-- ============================================================
-- STEP 1: PRESCRIPTIONS — Add all missing Phase 2 + Phase 4 columns
-- ============================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id),
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
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,2),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2);

-- Set prescription_date default
ALTER TABLE prescriptions
  ALTER COLUMN prescription_date SET DEFAULT CURRENT_DATE;

-- Ensure doctor_name and doctor_license_number are nullable
ALTER TABLE prescriptions ALTER COLUMN doctor_name DROP NOT NULL;
ALTER TABLE prescriptions ALTER COLUMN doctor_license_number DROP NOT NULL;

-- ============================================================
-- STEP 2: CUSTOMERS — Add height/weight
-- ============================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS height numeric(5,2),
  ADD COLUMN IF NOT EXISTS weight numeric(5,2);

-- ============================================================
-- STEP 3: RX NUMBER GENERATION TRIGGER
-- ============================================================

-- Counter table for atomic sequence generation
CREATE TABLE IF NOT EXISTS rx_number_counters (
  date_prefix text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

-- Function to generate sequential RX numbers
CREATE OR REPLACE FUNCTION generate_rx_number()
RETURNS TRIGGER AS $$
DECLARE
  v_date text;
  v_seq integer;
  v_number text;
BEGIN
  IF NEW.prescription_number IS NOT NULL AND NEW.prescription_number <> '' THEN
    RETURN NEW;
  END IF;
  v_date := to_char(CURRENT_DATE, 'YYYYMMDD');
  INSERT INTO rx_number_counters (date_prefix, last_number)
  VALUES (v_date, 1)
  ON CONFLICT (date_prefix)
  DO UPDATE SET last_number = rx_number_counters.last_number + 1
  RETURNING rx_number_counters.last_number INTO v_seq;
  v_number := 'RX-' || v_date || '-' || LPAD(v_seq::text, 5, '0');
  NEW.prescription_number := v_number;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_generate_rx_number ON prescriptions;
CREATE TRIGGER trg_generate_rx_number
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  WHEN (NEW.prescription_number IS NULL OR NEW.prescription_number = '') 
  EXECUTE FUNCTION generate_rx_number();

-- ============================================================
-- STEP 4: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_prescriptions_number ON prescriptions(prescription_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id) WHERE doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prescriptions_org ON prescriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);

-- Drop old strict UNIQUE on sale_id, replace with partial unique
DROP INDEX IF EXISTS idx_prescriptions_sale_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prescriptions_sale_unique 
  ON prescriptions(sale_id) WHERE sale_id IS NOT NULL;

-- ============================================================
-- STEP 5: RLS POLICIES FOR DOCTOR PRESCRIPTIONS
-- ============================================================

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Read: org members can read all org prescriptions
DROP POLICY IF EXISTS org_prescriptions_read ON prescriptions;
CREATE POLICY org_prescriptions_read ON prescriptions
  FOR SELECT USING (org_id = get_my_org_id());

-- Insert: doctors can create prescriptions for their org
DROP POLICY IF EXISTS doctor_prescriptions_insert ON prescriptions;
CREATE POLICY doctor_prescriptions_insert ON prescriptions
  FOR INSERT WITH CHECK (
    doctor_id = auth.uid() 
    AND org_id = get_my_org_id()
  );

-- Update: doctors can update their own prescriptions
DROP POLICY IF EXISTS doctor_prescriptions_update_own ON prescriptions;
CREATE POLICY doctor_prescriptions_update_own ON prescriptions
  FOR UPDATE USING (
    doctor_id = auth.uid() 
    AND org_id = get_my_org_id()
  );

-- Org-level void/update (for admin/pos)
DROP POLICY IF EXISTS org_prescriptions_void ON prescriptions;
CREATE POLICY org_prescriptions_void ON prescriptions
  FOR UPDATE USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- ============================================================
-- STEP 6: VERIFY
-- ============================================================

SELECT 'Prescriptions columns:' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prescriptions'
ORDER BY ordinal_position;

SELECT 'Customers columns:' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customers'
ORDER BY ordinal_position;

SELECT 'Trigger check:' AS section;
SELECT tgname AS trigger_name, tgtype, proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'prescriptions'::regclass;
