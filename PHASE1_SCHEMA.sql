-- ============================================================
-- PHASE 1: Critical Compliance & Payment Schema Updates
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. ADD TRANSFERENCIA PAYMENT METHOD
-- Update sales table payment_method constraint
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check 
  CHECK (payment_method IN ('cash', 'card', 'insurance', 'transferencia'));

-- 2. CREATE BANK ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  clabe text,
  account_holder text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_bank_accounts_org ON bank_accounts(org_id);

-- RLS for bank_accounts
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_bank_accounts ON bank_accounts;
CREATE POLICY org_bank_accounts ON bank_accounts
  FOR ALL USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- 3. CREATE SPLIT PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'insurance', 'transferencia')),
  amount numeric(10,2) NOT NULL,
  reference_number text,
  bank_account_id uuid REFERENCES bank_accounts(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_sale_payments_sale ON sale_payments(sale_id);

-- RLS for sale_payments
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_sale_payments ON sale_payments;
CREATE POLICY org_sale_payments ON sale_payments
  FOR ALL USING (
    sale_id IN (SELECT id FROM sales WHERE org_id = get_my_org_id())
  );

-- 4. CREATE PRESCRIPTIONS TABLE (COFEPRIS Compliance)
CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE,
  org_id uuid REFERENCES organizations(id),
  
  -- Patient info
  patient_name text NOT NULL,
  patient_curp text,
  
  -- Doctor info
  doctor_name text NOT NULL,
  doctor_license_number text NOT NULL,
  doctor_office_address text,
  doctor_phone text,
  
  -- Prescription info
  prescription_number text NOT NULL,
  prescription_date date NOT NULL,
  
  -- Status
  is_voided boolean DEFAULT false,
  voided_at timestamptz,
  voided_by uuid REFERENCES profiles(id),
  
  -- Audit
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  
  UNIQUE(sale_id)
);

CREATE INDEX idx_prescriptions_org ON prescriptions(org_id);
CREATE INDEX idx_prescriptions_sale ON prescriptions(sale_id);
CREATE INDEX idx_prescriptions_date ON prescriptions(prescription_date);

-- RLS for prescriptions - only insert/select, no update
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_prescriptions_read ON prescriptions;
CREATE POLICY org_prescriptions_read ON prescriptions
  FOR SELECT USING (org_id = get_my_org_id());

DROP POLICY IF EXISTS org_prescriptions_insert ON prescriptions;
CREATE POLICY org_prescriptions_insert ON prescriptions
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

-- Allow voiding (update only is_voided field via function)
DROP POLICY IF EXISTS org_prescriptions_void ON prescriptions;
CREATE POLICY org_prescriptions_void ON prescriptions
  FOR UPDATE USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- 5. UPDATE SALE_ITEMS FOR PRESCRIPTION TRACKING
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS requires_prescription boolean DEFAULT false;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES prescriptions(id);

-- 6. UPDATE SALES TABLE FOR SPLIT PAYMENTS
-- Add flag to indicate if sale has split payments
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_split_payment boolean DEFAULT false;

-- 7. VERIFY ALL CHANGES
SELECT 'Bank Accounts Table' as check_item, COUNT(*) as count FROM bank_accounts;
SELECT 'Sale Payments Table' as check_item, COUNT(*) as count FROM sale_payments;
SELECT 'Prescriptions Table' as check_item, COUNT(*) as count FROM prescriptions;

-- Show all columns for verification
SELECT 'sales columns updated' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales' 
AND column_name IN ('payment_method', 'is_split_payment');

SELECT 'sale_items columns updated' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sale_items' 
AND column_name IN ('requires_prescription', 'prescription_id');
