-- ============================================================
-- PHASE 3: COFEPRIS Prescription Compliance
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. ENSURE PRESCRIPTIONS TABLE EXISTS WITH ALL FIELDS
CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id),
  
  -- Patient info
  patient_name text NOT NULL,
  patient_curp text,
  
  -- Doctor info (COFEPRIS required)
  doctor_name text NOT NULL,
  doctor_license_number text NOT NULL, -- Cedula profesional
  doctor_office_address text, -- Domicilio del consultorio
  doctor_phone text, -- Telefono del medico
  
  -- Prescription info
  prescription_number text NOT NULL, -- Numero de receta
  prescription_date date NOT NULL, -- Fecha de la receta
  
  -- Audit & Compliance
  is_voided boolean DEFAULT false,
  voided_at timestamptz,
  voided_by uuid REFERENCES profiles(id),
  voided_reason text,
  
  -- Immutable audit
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  
  UNIQUE(sale_id)
);

-- Indexes for reporting
CREATE INDEX IF NOT EXISTS idx_prescriptions_org ON prescriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_license_number);
CREATE INDEX IF NOT EXISTS idx_prescriptions_voided ON prescriptions(is_voided);

-- 2. RLS POLICIES - PRESCRIPTIONS CANNOT BE UPDATED, ONLY INSERTED AND VOIDED
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

-- Allow reading prescriptions in org
DROP POLICY IF EXISTS org_prescriptions_read ON prescriptions;
CREATE POLICY org_prescriptions_read ON prescriptions
  FOR SELECT USING (org_id = get_my_org_id());

-- Allow inserting prescriptions
DROP POLICY IF EXISTS org_prescriptions_insert ON prescriptions;
CREATE POLICY org_prescriptions_insert ON prescriptions
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

-- Allow voiding (only updating is_voided fields)
DROP POLICY IF EXISTS org_prescriptions_void ON prescriptions;
CREATE POLICY org_prescriptions_void ON prescriptions
  FOR UPDATE USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- 3. FUNCTION TO VOID PRESCRIPTION (with audit)
CREATE OR REPLACE FUNCTION void_prescription(
  p_prescription_id uuid,
  p_voided_by uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE prescriptions
  SET 
    is_voided = true,
    voided_at = NOW(),
    voided_by = p_voided_by,
    voided_reason = p_reason
  WHERE id = p_prescription_id
  AND is_voided = false; -- Only void if not already voided
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found or already voided';
  END IF;
END;
$$;

-- 4. CREATE CONTROLLED SUBSTANCES LOG VIEW
-- For COFEPRIS reporting
CREATE OR REPLACE VIEW controlled_substances_sales AS
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
  si.rx_number,
  u.full_name as seller_name
FROM prescriptions p
JOIN sales s ON p.sale_id = s.id
JOIN sale_items si ON si.sale_id = s.id
JOIN profiles u ON s.salesperson = u.full_name OR s.salesperson_id = u.id
WHERE p.is_voided = false
AND si.requires_prescription = true;

-- 5. VERIFY TABLE STRUCTURE
SELECT 'Prescriptions table structure:' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'prescriptions'
ORDER BY ordinal_position;

-- 6. ADD COMMENTS FOR DOCUMENTATION
COMMENT ON TABLE prescriptions IS 'COFEPRIS-compliant prescription records. Immutable - can only be voided, not edited.';
COMMENT ON COLUMN prescriptions.doctor_license_number IS 'Cedula profesional del medico';
COMMENT ON COLUMN prescriptions.doctor_office_address IS 'Domicilio del consultorio';
COMMENT ON COLUMN prescriptions.is_voided IS 'Soft delete - prescription is cancelled but record remains for audit';
