-- ============================================================
-- PHASE 4: COFEPRIS Reports Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. ENSURE PRESCRIPTIONS TABLE EXISTS (safe version)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prescriptions') THEN
    CREATE TABLE prescriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
      org_id uuid REFERENCES organizations(id),
      patient_name text NOT NULL,
      patient_curp text,
      doctor_name text NOT NULL,
      doctor_license_number text NOT NULL,
      doctor_office_address text,
      doctor_phone text,
      prescription_number text NOT NULL,
      prescription_date date NOT NULL,
      is_voided boolean DEFAULT false,
      voided_at timestamptz,
      voided_by uuid REFERENCES profiles(id),
      voided_reason text,
      created_at timestamptz DEFAULT now(),
      created_by uuid REFERENCES profiles(id),
      UNIQUE(sale_id)
    );
  END IF;
END $$;

-- 2. ADD MISSING COLUMNS TO PRESCRIPTIONS (if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescriptions' AND column_name = 'doctor_office_address') THEN
    ALTER TABLE prescriptions ADD COLUMN doctor_office_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescriptions' AND column_name = 'doctor_phone') THEN
    ALTER TABLE prescriptions ADD COLUMN doctor_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescriptions' AND column_name = 'is_voided') THEN
    ALTER TABLE prescriptions ADD COLUMN is_voided boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescriptions' AND column_name = 'voided_at') THEN
    ALTER TABLE prescriptions ADD COLUMN voided_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescriptions' AND column_name = 'voided_by') THEN
    ALTER TABLE prescriptions ADD COLUMN voided_by uuid REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescriptions' AND column_name = 'voided_reason') THEN
    ALTER TABLE prescriptions ADD COLUMN voided_reason text;
  END IF;
END $$;

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_prescriptions_org ON prescriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);
CREATE INDEX IF NOT EXISTS idx_prescriptions_voided ON prescriptions(is_voided);

-- 4. CREATE CONTROLLED SUBSTANCES VIEW
DROP VIEW IF EXISTS controlled_substances_sales;
CREATE VIEW controlled_substances_sales AS
SELECT 
  p.id as prescription_id,
  p.patient_name,
  p.patient_curp,
  p.doctor_name,
  p.doctor_license_number,
  p.prescription_number,
  p.prescription_date,
  s.id as sale_id,
  s.timestamp as sale_date,
  s.total,
  si.name as medication_name,
  si.quantity,
  si.price,
  si.rx_number
FROM prescriptions p
JOIN sales s ON p.sale_id = s.id
JOIN sale_items si ON si.sale_id = s.id
WHERE p.is_voided = false
AND si.requires_prescription = true;

-- 5. CREATE INVENTORY MOVEMENT VIEW
DROP VIEW IF EXISTS inventory_movement;
CREATE VIEW inventory_movement AS
SELECT 
  sa.id,
  sa.inventory_id,
  i.name as medication_name,
  sa.previous_quantity,
  sa.new_quantity,
  sa.new_quantity - sa.previous_quantity as change,
  sa.reason,
  sa.adjusted_by_name,
  sa.created_at
FROM stock_adjustments sa
JOIN inventory i ON sa.inventory_id = i.id
ORDER BY sa.created_at DESC;

-- 6. CREATE EXPIRATION TRACKING VIEW
DROP VIEW IF EXISTS expiration_tracking;
CREATE VIEW expiration_tracking AS
SELECT 
  i.id,
  i.name,
  i.batch_number,
  i.expiration_date,
  i.quantity,
  i.location_id,
  CASE 
    WHEN i.expiration_date < CURRENT_DATE THEN 'EXPIRED'
    WHEN i.expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'CRITICAL'
    WHEN i.expiration_date <= CURRENT_DATE + INTERVAL '90 days' THEN 'WARNING'
    ELSE 'GOOD'
  END as status,
  CASE 
    WHEN i.expiration_date < CURRENT_DATE THEN 0
    ELSE (i.expiration_date - CURRENT_DATE)
  END as days_until_expiry
FROM inventory i
WHERE i.expiration_date IS NOT NULL
ORDER BY i.expiration_date ASC;

-- 7. RLS POLICIES
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_prescriptions_read ON prescriptions;
CREATE POLICY org_prescriptions_read ON prescriptions
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS org_prescriptions_insert ON prescriptions;
CREATE POLICY org_prescriptions_insert ON prescriptions
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

DROP POLICY IF EXISTS org_prescriptions_void ON prescriptions;
CREATE POLICY org_prescriptions_void ON prescriptions
  FOR UPDATE USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- 8. VERIFY
SELECT 'Prescriptions table ready' as status;
SELECT column_name FROM information_schema.columns WHERE table_name = 'prescriptions' ORDER BY ordinal_position;
