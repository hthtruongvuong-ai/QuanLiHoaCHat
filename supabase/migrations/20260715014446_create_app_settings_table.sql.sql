/*
# Create app_settings table for system-wide configuration

1. New Tables
- `app_settings`
  - `id` (uuid, primary key, fixed singleton row)
  - `key` (text, unique) — setting key e.g. 'initial_inventory_done'
  - `value` (text) — setting value
  - `updated_by` (uuid, nullable) — user who last updated
  - `updated_at` (timestamptz) — last update timestamp
2. Security
- Enable RLS on `app_settings`.
- Allow anon + authenticated to SELECT (needed for frontend reads).
- Only authenticated can INSERT/UPDATE (admin enforcement in app).
- No DELETE policy (settings should not be deleted).
3. Purpose
- Tracks whether initial inventory has been completed (one-time only).
- Future extensible key-value store for app-wide settings.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_app_settings" ON app_settings;
CREATE POLICY "anon_select_app_settings" ON app_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_app_settings" ON app_settings;
CREATE POLICY "auth_insert_app_settings" ON app_settings FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_app_settings" ON app_settings;
CREATE POLICY "auth_update_app_settings" ON app_settings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
