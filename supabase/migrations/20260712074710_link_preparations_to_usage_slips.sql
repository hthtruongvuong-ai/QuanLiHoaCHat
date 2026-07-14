/*
# Link Preparations to Usage Slips

## Overview
Adds a `usage_slip_id` column to the `preparations` table so that a preparation
record can be linked to the usage slip that authorized the chemical consumption.

## Modified Tables
- **preparations**: added `usage_slip_id` (uuid, FK → usage_slips, SET NULL).
  This column is nullable — preparations created standalone (without a usage slip)
  will have NULL. Preparations created from a usage slip will reference the slip.

## Security
- No policy changes needed — the existing RLS policies on preparations already
  allow authenticated users to INSERT/UPDATE/SELECT.

## Notes
1. When a user creates a usage slip with purpose "pha chế", the system creates a
   draft preparation linked to that slip. The user then fills in product details.
2. The preparation inherits the chemical items from the usage slip automatically.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'preparations' AND column_name = 'usage_slip_id'
  ) THEN
    ALTER TABLE preparations ADD COLUMN usage_slip_id uuid REFERENCES usage_slips(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_preparations_usage_slip_id ON preparations(usage_slip_id);
