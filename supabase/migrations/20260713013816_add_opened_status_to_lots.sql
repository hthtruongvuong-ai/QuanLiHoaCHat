/*
# Add opened status to lots

## Overview
Adds an `opened` boolean column to the `lots` table to track whether a lot
has been opened (cap removed) or is still sealed.

## Modified Tables
- **lots**: added `opened` (boolean, default false). When a lot is first used
  (stock-out or usage slip), the system can mark it as opened.

## Security
- No policy changes needed — existing RLS policies already allow authenticated
  users to SELECT/UPDATE lots.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lots' AND column_name = 'opened'
  ) THEN
    ALTER TABLE lots ADD COLUMN opened boolean NOT NULL DEFAULT false;
  END IF;
END $$;
