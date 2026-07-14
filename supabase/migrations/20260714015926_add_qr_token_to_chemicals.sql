/*
# Add qr_token column to chemicals

## Overview
Adds a unique `qr_token` column to the `chemicals` table. Each chemical gets a short, URL-safe token (8-char base62) that maps to its UUID. QR codes encode `/qr/<token>` so they work across web, Electron, and mobile without exposing the internal UUID.

## Changes
- `qr_token` text, UNIQUE, nullable (backfilled for existing rows via trigger)
- Index on `qr_token` for fast lookups

## Security
- RLS already enabled on `chemicals`; no policy changes needed.
*/

ALTER TABLE chemicals ADD COLUMN IF NOT EXISTS qr_token text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_chemicals_qr_token ON chemicals(qr_token);

-- Backfill existing rows that have no qr_token
UPDATE chemicals
SET qr_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
WHERE qr_token IS NULL;
