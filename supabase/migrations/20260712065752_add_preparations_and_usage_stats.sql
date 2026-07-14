/*
# Add Preparation Records and Usage Statistics Support

## Overview
Adds two new tables to support chemical preparation records (hồ sơ pha chế) and
enhanced usage statistics tracking. Also adds an `updated_at` column to usage_slips
for edit tracking.

## New Tables

1. **preparations** — Records of chemical preparations/solutions made in the lab.
   - `id` (uuid, PK)
   - `prep_number` (text, unique) — e.g. PREP-2024-001
   - `product_name` (text) — name of the prepared solution/product
   - `product_code` (text) — code for the prepared product
   - `target_concentration` (text) — e.g. "0.1M", "10%"
   - `target_volume` (numeric) — volume prepared
   - `unit` (text) — unit of volume
   - `procedure` (text) — preparation procedure/method
   - `result` (text) — outcome (success | failed | pending)
   - `notes` (text)
   - `user_id` (uuid, FK → auth.users, default auth.uid())
   - `user_name` (text) — denormalized for display
   - `status` (text: draft | completed)
   - `created_at`, `updated_at` (timestamptz)

2. **preparation_items** — Chemicals used in a preparation (auto-checked against stock).
   - `id` (uuid, PK)
   - `preparation_id` (uuid, FK → preparations, CASCADE)
   - `lot_id` (uuid, FK → lots, SET NULL)
   - `chemical_id` (uuid, FK → chemicals, SET NULL)
   - `chemical_name` (text) — denormalized
   - `quantity_used` (numeric) — amount consumed
   - `unit` (text)
   - `created_at` (timestamptz)

## Modified Tables
- **usage_slips**: added `updated_at` column for edit tracking.

## Security (RLS)
- All new tables have RLS enabled.
- SELECT: authenticated users can read (shared lab data).
- INSERT/UPDATE/DELETE: authenticated users can write.
- owner columns (user_id on preparations) default to auth.uid().

## Notes
1. When a preparation is completed, lot quantities are decremented and stock_movements recorded.
2. The app auto-checks chemical stock availability before allowing a preparation to complete.
3. Preparation items link to both lots and chemicals for full traceability.
*/

-- ============================================================
-- Add updated_at to usage_slips
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_slips' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE usage_slips ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- ============================================================
-- PREPARATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_number text NOT NULL UNIQUE,
  product_name text NOT NULL DEFAULT '',
  product_code text DEFAULT '',
  target_concentration text DEFAULT '',
  target_volume numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'ml',
  procedure text DEFAULT '',
  result text NOT NULL DEFAULT 'pending' CHECK (result IN ('success', 'failed', 'pending')),
  notes text DEFAULT '',
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE preparations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_preparations" ON preparations;
CREATE POLICY "select_preparations" ON preparations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_preparations" ON preparations;
CREATE POLICY "insert_preparations" ON preparations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_preparations" ON preparations;
CREATE POLICY "update_preparations" ON preparations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_preparations" ON preparations;
CREATE POLICY "delete_preparations" ON preparations FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- PREPARATION ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS preparation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES lots(id) ON DELETE SET NULL,
  chemical_id uuid REFERENCES chemicals(id) ON DELETE SET NULL,
  chemical_name text NOT NULL DEFAULT '',
  quantity_used numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'g',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE preparation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_preparation_items" ON preparation_items;
CREATE POLICY "select_preparation_items" ON preparation_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_preparation_items" ON preparation_items;
CREATE POLICY "insert_preparation_items" ON preparation_items FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_preparation_items" ON preparation_items;
CREATE POLICY "update_preparation_items" ON preparation_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_preparation_items" ON preparation_items;
CREATE POLICY "delete_preparation_items" ON preparation_items FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_preparation_items_prep_id ON preparation_items(preparation_id);
CREATE INDEX IF NOT EXISTS idx_preparation_items_chemical_id ON preparation_items(chemical_id);
CREATE INDEX IF NOT EXISTS idx_preparations_created_at ON preparations(created_at DESC);
