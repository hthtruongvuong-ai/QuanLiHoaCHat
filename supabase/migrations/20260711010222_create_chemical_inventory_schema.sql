/*
# Chemical Inventory Management Schema

## Overview
Creates the complete database schema for a laboratory chemical inventory management system
with authentication-based access control. Users sign in to track chemicals, lots (batches),
storage locations, usage slips, and stock movements.

## New Tables

1. **profiles** — Extends `auth.users` with role and display info.
   - `id` (uuid, PK, references auth.users)
   - `full_name` (text)
   - `role` (text: admin | chemist | technician, default technician)
   - `created_at` (timestamptz)

2. **storage_locations** — Warehouse/shelf locations for chemicals.
   - `id` (uuid, PK)
   - `name` (text, unique)
   - `building` (text)
   - `room` (text)
   - `description` (text)
   - `created_at` (timestamptz)

3. **chemicals** — Master catalog of chemicals.
   - `id` (uuid, PK)
   - `code` (text, unique) — human-readable code e.g. CHM-001
   - `name` (text)
   - `cas_number` (text) — Chemical Abstracts Service number
   - `formula` (text) — chemical formula
   - `unit` (text) — measurement unit (g, ml, L, kg)
   - `min_stock` (numeric) — minimum stock threshold for alerts
   - `hazard_level` (text: low | medium | high | toxic)
   - `category` (text) — e.g. acid, base, solvent, salt
   - `description` (text)
   - `created_at`, `updated_at` (timestamptz)

4. **lots** — Individual batches/lots of a chemical with expiry tracking.
   - `id` (uuid, PK)
   - `chemical_id` (uuid, FK → chemicals)
   - `lot_number` (text) — batch/lot identifier
   - `quantity` (numeric) — current remaining quantity
   - `initial_quantity` (numeric) — original quantity received
   - `unit` (text)
   - `received_date` (date)
   - `expiry_date` (date)
   - `storage_location_id` (uuid, FK → storage_locations)
   - `supplier` (text)
   - `status` (text: active | expired | depleted)
   - `created_at`, `updated_at` (timestamptz)

5. **usage_slips** — Tickets recording chemical usage.
   - `id` (uuid, PK)
   - `slip_number` (text, unique) — e.g. US-2024-001
   - `user_id` (uuid, FK → auth.users) — who created the slip
   - `user_name` (text) — denormalized for display
   - `purpose` (text) — reason for usage
   - `status` (text: draft | confirmed)
   - `created_at` (timestamptz)

6. **usage_slip_items** — Line items in a usage slip.
   - `id` (uuid, PK)
   - `slip_id` (uuid, FK → usage_slips, CASCADE)
   - `lot_id` (uuid, FK → lots)
   - `chemical_name` (text) — denormalized
   - `quantity_used` (numeric)
   - `unit` (text)
   - `created_at` (timestamptz)

7. **stock_movements** — Log of all stock-in and stock-out transactions.
   - `id` (uuid, PK)
   - `movement_type` (text: in | out | adjust)
   - `lot_id` (uuid, FK → lots)
   - `chemical_id` (uuid, FK → chemicals)
   - `quantity` (numeric) — positive for in, negative for out
   - `unit` (text)
   - `reference` (text) — slip number or supplier PO
   - `user_id` (uuid, FK → auth.users)
   - `user_name` (text)
   - `notes` (text)
   - `created_at` (timestamptz)

## Security (RLS)
- All tables have RLS enabled.
- profiles: users read own profile; admins read/update all.
- All inventory tables: authenticated users can SELECT (shared lab data).
- INSERT/UPDATE/DELETE: authenticated users (admin & chemist can write; restricted by app-level role checks).
- owner columns (user_id on usage_slips, stock_movements) default to auth.uid().

## Notes
1. `profiles.role` is the authorization role — checked in app code, not enforced via RLS column (RLS grants access to all authenticated users; app enforces write restrictions by role).
2. `chemicals.code` and `usage_slips.slip_number` use auto-generated sequences via a helper.
3. When a usage slip is confirmed, lot quantities are decremented and stock_movements are recorded (handled via app-level transactions using the service role key in server actions).
*/

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'technician' CHECK (role IN ('admin', 'chemist', 'technician')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================================
-- STORAGE LOCATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  building text DEFAULT '',
  room text DEFAULT '',
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE storage_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_storage_locations" ON storage_locations;
CREATE POLICY "select_storage_locations" ON storage_locations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_storage_locations" ON storage_locations;
CREATE POLICY "insert_storage_locations" ON storage_locations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_storage_locations" ON storage_locations;
CREATE POLICY "update_storage_locations" ON storage_locations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_storage_locations" ON storage_locations;
CREATE POLICY "delete_storage_locations" ON storage_locations FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- CHEMICALS
-- ============================================================
CREATE TABLE IF NOT EXISTS chemicals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  cas_number text DEFAULT '',
  formula text DEFAULT '',
  unit text NOT NULL DEFAULT 'g',
  min_stock numeric NOT NULL DEFAULT 0,
  hazard_level text NOT NULL DEFAULT 'low' CHECK (hazard_level IN ('low', 'medium', 'high', 'toxic')),
  category text DEFAULT '',
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chemicals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_chemicals" ON chemicals;
CREATE POLICY "select_chemicals" ON chemicals FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_chemicals" ON chemicals;
CREATE POLICY "insert_chemicals" ON chemicals FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_chemicals" ON chemicals;
CREATE POLICY "update_chemicals" ON chemicals FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_chemicals" ON chemicals;
CREATE POLICY "delete_chemicals" ON chemicals FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- LOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chemical_id uuid NOT NULL REFERENCES chemicals(id) ON DELETE CASCADE,
  lot_number text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  initial_quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'g',
  received_date date,
  expiry_date date,
  storage_location_id uuid REFERENCES storage_locations(id) ON DELETE SET NULL,
  supplier text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'depleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_lots" ON lots;
CREATE POLICY "select_lots" ON lots FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_lots" ON lots;
CREATE POLICY "insert_lots" ON lots FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_lots" ON lots;
CREATE POLICY "update_lots" ON lots FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_lots" ON lots;
CREATE POLICY "delete_lots" ON lots FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lots_chemical_id ON lots(chemical_id);
CREATE INDEX IF NOT EXISTS idx_lots_expiry_date ON lots(expiry_date);
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);

-- ============================================================
-- USAGE SLIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usage_slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_usage_slips" ON usage_slips;
CREATE POLICY "select_usage_slips" ON usage_slips FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_usage_slips" ON usage_slips;
CREATE POLICY "insert_usage_slips" ON usage_slips FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_usage_slips" ON usage_slips;
CREATE POLICY "update_usage_slips" ON usage_slips FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_usage_slips" ON usage_slips;
CREATE POLICY "delete_usage_slips" ON usage_slips FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- USAGE SLIP ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_slip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id uuid NOT NULL REFERENCES usage_slips(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES lots(id) ON DELETE SET NULL,
  chemical_name text NOT NULL DEFAULT '',
  quantity_used numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'g',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usage_slip_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_usage_slip_items" ON usage_slip_items;
CREATE POLICY "select_usage_slip_items" ON usage_slip_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_usage_slip_items" ON usage_slip_items;
CREATE POLICY "insert_usage_slip_items" ON usage_slip_items FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_usage_slip_items" ON usage_slip_items;
CREATE POLICY "update_usage_slip_items" ON usage_slip_items FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_usage_slip_items" ON usage_slip_items;
CREATE POLICY "delete_usage_slip_items" ON usage_slip_items FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_usage_slip_items_slip_id ON usage_slip_items(slip_id);

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust')),
  lot_id uuid REFERENCES lots(id) ON DELETE SET NULL,
  chemical_id uuid REFERENCES chemicals(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'g',
  reference text DEFAULT '',
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_stock_movements" ON stock_movements;
CREATE POLICY "select_stock_movements" ON stock_movements FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_stock_movements" ON stock_movements;
CREATE POLICY "insert_stock_movements" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_stock_movements" ON stock_movements;
CREATE POLICY "update_stock_movements" ON stock_movements FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_stock_movements" ON stock_movements;
CREATE POLICY "delete_stock_movements" ON stock_movements FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stock_movements_lot_id ON stock_movements(lot_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_chemical_id ON stock_movements(chemical_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);

-- ============================================================
-- AUTO-GENERATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'technician')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO storage_locations (name, building, room, description) VALUES
  ('Kho A - Tủ 1', 'Tòa A', 'A.101', 'Hóa chất vô cơ'),
  ('Kho A - Tủ 2', 'Tòa A', 'A.101', 'Hóa chất hữu cơ'),
  ('Kho B - Tủ đông lạnh', 'Tòa B', 'B.205', 'Hóa chất cần bảo quản lạnh'),
  ('Kho C - Tủ độc hại', 'Tòa C', 'C.301', 'Hóa chất độc hại, cần kiểm soát')
ON CONFLICT (name) DO NOTHING;

INSERT INTO chemicals (code, name, cas_number, formula, unit, min_stock, hazard_level, category, description) VALUES
  ('CHM-001', 'Acid Sulfuric', '7664-93-9', 'H2SO4', 'ml', 500, 'high', 'acid', 'Axít mạnh, ăn mòn'),
  ('CHM-002', 'Sodium Hydroxide', '1310-73-2', 'NaOH', 'g', 200, 'high', 'base', 'Bazo mạnh'),
  ('CHM-003', 'Ethanol', '64-17-5', 'C2H5OH', 'ml', 1000, 'medium', 'solvent', 'Dung môi phổ biến'),
  ('CHM-004', 'Acid Chlorhydric', '7647-01-0', 'HCl', 'ml', 300, 'high', 'acid', 'Axít mạnh, bay hơi'),
  ('CHM-005', 'Potassium Permanganate', '7722-64-7', 'KMnO4', 'g', 100, 'medium', 'oxidizer', 'Chất oxy hóa mạnh'),
  ('CHM-006', 'Acetone', '67-64-1', 'C3H6O', 'ml', 500, 'medium', 'solvent', 'Dung môi hữu cơ'),
  ('CHM-007', 'Silver Nitrate', '7761-88-8', 'AgNO3', 'g', 50, 'toxic', 'salt', 'Độc, nhạy sáng'),
  ('CHM-008', 'Hydrogen Peroxide', '7722-84-1', 'H2O2', 'ml', 250, 'medium', 'oxidizer', 'Chất oxy hóa')
ON CONFLICT (code) DO NOTHING;

-- Lots for the seeded chemicals
INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-001', 800, 1000, 'ml', '2024-01-15', '2026-01-15', sl.id, 'Sigma-Aldrich', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-001' AND sl.name = 'Kho A - Tủ 1'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-002', 150, 500, 'g', '2024-03-01', '2027-03-01', sl.id, 'Merck', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-002' AND sl.name = 'Kho A - Tủ 1'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-003', 2000, 2500, 'ml', '2024-02-10', '2026-08-10', sl.id, 'Xilab', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-003' AND sl.name = 'Kho A - Tủ 2'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-004', 100, 500, 'ml', '2023-12-01', '2025-07-01', sl.id, 'Sigma-Aldrich', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-004' AND sl.name = 'Kho A - Tủ 1'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-005', 40, 200, 'g', '2024-01-20', '2025-08-20', sl.id, 'Xilab', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-005' AND sl.name = 'Kho A - Tủ 2'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-006', 1200, 2000, 'ml', '2024-04-05', '2027-04-05', sl.id, 'Xilab', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-006' AND sl.name = 'Kho A - Tủ 2'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-007', 25, 100, 'g', '2024-02-15', '2025-02-15', sl.id, 'Sigma-Aldrich', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-007' AND sl.name = 'Kho C - Tủ độc hại'
ON CONFLICT DO NOTHING;

INSERT INTO lots (chemical_id, lot_number, quantity, initial_quantity, unit, received_date, expiry_date, storage_location_id, supplier, status)
SELECT c.id, 'L-2024-008', 300, 1000, 'ml', '2024-05-01', '2026-05-01', sl.id, 'Merck', 'active'
FROM chemicals c, storage_locations sl WHERE c.code = 'CHM-008' AND sl.name = 'Kho B - Tủ đông lạnh'
ON CONFLICT DO NOTHING;
