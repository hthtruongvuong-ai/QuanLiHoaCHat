/*
# Create prepared_solutions and prepared_solution_usages tables

## Overview
Creates two new tables to track prepared (mixed) chemical solutions:
1. `prepared_solutions` — one record per successfully prepared solution (auto-created when a preparation is completed).
2. `prepared_solution_usages` — usage history: each time a prepared solution is consumed via a usage slip.

## New Tables

### prepared_solutions
- `id` (uuid, PK)
- `preparation_id` (uuid, FK → preparations.id ON DELETE SET NULL) — links back to the prep record
- `batch_code` (text) — mã lô pha, e.g. "SOL-2026-001"
- `solution_name` (text) — tên dung dịch
- `concentration` (text) — nồng độ
- `initial_volume` (numeric) — thể tích ban đầu
- `used_volume` (numeric, default 0) — đã sử dụng
- `remaining_volume` (numeric) — còn lại (= initial_volume - used_volume)
- `unit` (text) — đơn vị
- `prepared_date` (date) — ngày pha
- `shelf_life_days` (integer) — hạn bảo quản (số ngày)
- `expiry_date` (date) — ngày hết hạn (= prepared_date + shelf_life_days)
- `usage_role` (text) — vai trò sử dụng
- `prepared_by` (text) — người pha
- `status` (text, default 'in_use') — computed by app: in_use | low_stock | depleted | near_expiry | expired
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### prepared_solution_usages
- `id` (uuid, PK)
- `prepared_solution_id` (uuid, FK → prepared_solutions.id ON DELETE CASCADE)
- `usage_slip_id` (uuid, FK → usage_slips.id ON DELETE SET NULL) — links to the usage slip
- `slip_number` (text) — mã phiếu sử dụng
- `user_id` (uuid, nullable)
- `user_name` (text) — người sử dụng
- `quantity_used` (numeric) — số lượng sử dụng
- `unit` (text)
- `used_at` (timestamptz) — thời gian sử dụng
- `created_at` (timestamptz)

## Security
- RLS enabled on both tables.
- 4 CRUD policies each, scoped to `authenticated` (app has sign-in).
- Ownership is not user-scoped — any authenticated user can manage prepared solutions (lab shared data).
*/

-- prepared_solutions
CREATE TABLE IF NOT EXISTS prepared_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid REFERENCES preparations(id) ON DELETE SET NULL,
  batch_code text NOT NULL,
  solution_name text NOT NULL,
  concentration text DEFAULT '',
  initial_volume numeric NOT NULL DEFAULT 0,
  used_volume numeric NOT NULL DEFAULT 0,
  remaining_volume numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'ml',
  prepared_date date NOT NULL DEFAULT CURRENT_DATE,
  shelf_life_days integer DEFAULT 30,
  expiry_date date,
  usage_role text DEFAULT '',
  prepared_by text DEFAULT '',
  status text NOT NULL DEFAULT 'in_use',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE prepared_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ps_select_auth" ON prepared_solutions;
CREATE POLICY "ps_select_auth" ON prepared_solutions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ps_insert_auth" ON prepared_solutions;
CREATE POLICY "ps_insert_auth" ON prepared_solutions FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ps_update_auth" ON prepared_solutions;
CREATE POLICY "ps_update_auth" ON prepared_solutions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ps_delete_auth" ON prepared_solutions;
CREATE POLICY "ps_delete_auth" ON prepared_solutions FOR DELETE
  TO authenticated USING (true);

-- prepared_solution_usages
CREATE TABLE IF NOT EXISTS prepared_solution_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prepared_solution_id uuid REFERENCES prepared_solutions(id) ON DELETE CASCADE,
  usage_slip_id uuid REFERENCES usage_slips(id) ON DELETE SET NULL,
  slip_number text NOT NULL DEFAULT '',
  user_id uuid,
  user_name text DEFAULT '',
  quantity_used numeric NOT NULL DEFAULT 0,
  unit text DEFAULT 'ml',
  used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prepared_solution_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psu_select_auth" ON prepared_solution_usages;
CREATE POLICY "psu_select_auth" ON prepared_solution_usages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "psu_insert_auth" ON prepared_solution_usages;
CREATE POLICY "psu_insert_auth" ON prepared_solution_usages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "psu_update_auth" ON prepared_solution_usages;
CREATE POLICY "psu_update_auth" ON prepared_solution_usages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "psu_delete_auth" ON prepared_solution_usages;
CREATE POLICY "psu_delete_auth" ON prepared_solution_usages FOR DELETE
  TO authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prepared_solutions_preparation_id ON prepared_solutions(preparation_id);
CREATE INDEX IF NOT EXISTS idx_prepared_solution_usages_solution_id ON prepared_solution_usages(prepared_solution_id);
CREATE INDEX IF NOT EXISTS idx_prepared_solution_usages_slip_id ON prepared_solution_usages(usage_slip_id);
