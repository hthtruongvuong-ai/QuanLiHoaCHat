/*
# Create chemical_safety_docs table for Safety & Documentation

## Overview
Creates a table to store safety documents (SDS, COA) and safety metadata (GHS classification, PPE, spill handling, storage conditions, document expiry) for each chemical.

## New Table: chemical_safety_docs
- `id` (uuid, PK)
- `chemical_id` (uuid, FK → chemicals.id ON DELETE CASCADE)
- `doc_type` (text) — 'sds' | 'coa' | 'other'
- `doc_name` (text) — original file name
- `doc_url` (text) — public URL in Supabase storage
- `doc_expiry` (date, nullable) — hạn sử dụng tài liệu
- `uploaded_by` (text) — người tải lên
- `version` (integer, default 1) — version number for update history
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## New Table: chemical_safety_info
- `id` (uuid, PK)
- `chemical_id` (uuid, FK → chemicals.id ON DELETE CASCADE, UNIQUE)
- `ghs_classification` (text) — phân loại nguy hiểm GHS, e.g. "GHS02,GHS07"
- `ghs_symbols` (text) — comma-separated GHS pictogram codes
- `storage_conditions` (text) — điều kiện bảo quản
- `ppe` (text) — trang bị bảo hộ (PPE)
- `spill_handling` (text) — hướng dẫn xử lý khi tràn đổ
- `first_aid` (text) — sơ cứu
- `updated_at` (timestamptz)

## Security
- RLS enabled on both tables.
- 4 CRUD policies each, scoped to `authenticated`.
*/

CREATE TABLE IF NOT EXISTS chemical_safety_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chemical_id uuid REFERENCES chemicals(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'sds',
  doc_name text NOT NULL DEFAULT '',
  doc_url text NOT NULL DEFAULT '',
  doc_expiry date,
  uploaded_by text DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE chemical_safety_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csd_select_auth" ON chemical_safety_docs;
CREATE POLICY "csd_select_auth" ON chemical_safety_docs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "csd_insert_auth" ON chemical_safety_docs;
CREATE POLICY "csd_insert_auth" ON chemical_safety_docs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "csd_update_auth" ON chemical_safety_docs;
CREATE POLICY "csd_update_auth" ON chemical_safety_docs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "csd_delete_auth" ON chemical_safety_docs;
CREATE POLICY "csd_delete_auth" ON chemical_safety_docs FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_chemical_safety_docs_chemical_id ON chemical_safety_docs(chemical_id);

CREATE TABLE IF NOT EXISTS chemical_safety_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chemical_id uuid UNIQUE REFERENCES chemicals(id) ON DELETE CASCADE,
  ghs_classification text DEFAULT '',
  ghs_symbols text DEFAULT '',
  storage_conditions text DEFAULT '',
  ppe text DEFAULT '',
  spill_handling text DEFAULT '',
  first_aid text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE chemical_safety_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csi_select_auth" ON chemical_safety_info;
CREATE POLICY "csi_select_auth" ON chemical_safety_info FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "csi_insert_auth" ON chemical_safety_info;
CREATE POLICY "csi_insert_auth" ON chemical_safety_info FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "csi_update_auth" ON chemical_safety_info;
CREATE POLICY "csi_update_auth" ON chemical_safety_info FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "csi_delete_auth" ON chemical_safety_info;
CREATE POLICY "csi_delete_auth" ON chemical_safety_info FOR DELETE
  TO authenticated USING (true);
