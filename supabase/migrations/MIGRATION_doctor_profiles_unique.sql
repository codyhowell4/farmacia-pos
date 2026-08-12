-- ============================================================
-- MIGRATION: Ensure doctor_profiles has unique constraint on profile_id
-- Safe to run multiple times — uses IF NOT EXISTS
-- ============================================================

-- If the column was created with inline UNIQUE, the constraint already exists
-- with an auto-generated name. This migration adds an explicitly-named
-- constraint so upsert/onConflict references are stable.

DO $$
BEGIN
  -- Only add the constraint if it does not already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'doctor_profiles'::regclass
      AND contype = 'u'
      AND (
        conname = 'doctor_profiles_profile_id_key'
        OR pg_get_constraintdef(oid) LIKE '%(profile_id)%'
      )
  ) THEN
    ALTER TABLE doctor_profiles
      ADD CONSTRAINT doctor_profiles_profile_id_key
      UNIQUE (profile_id);
  END IF;
END $$;

-- Verify
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'doctor_profiles'::regclass AND contype = 'u';
