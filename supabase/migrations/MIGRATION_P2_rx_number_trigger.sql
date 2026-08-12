-- ============================================================
-- PHASE 2 MIGRATION: Auto-generate RX numbers
-- Format: RX-YYYYMMDD-XXXXX
-- ============================================================

-- Function to generate sequential RX numbers per day
CREATE OR REPLACE FUNCTION generate_rx_number()
RETURNS TRIGGER AS $$
DECLARE
  v_date text;
  v_seq integer;
  v_number text;
BEGIN
  -- Only generate if prescription_number is empty
  IF NEW.prescription_number IS NOT NULL AND NEW.prescription_number <> '' THEN
    RETURN NEW;
  END IF;

  v_date := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- Get next sequence number for today using a counter table
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

-- Counter table for atomic sequence generation
CREATE TABLE IF NOT EXISTS rx_number_counters (
  date_prefix text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_generate_rx_number ON prescriptions;

-- Create trigger (only fires when prescription_number is empty)
CREATE TRIGGER trg_generate_rx_number
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  WHEN (NEW.prescription_number IS NULL OR NEW.prescription_number = '') 
  EXECUTE FUNCTION generate_rx_number();
