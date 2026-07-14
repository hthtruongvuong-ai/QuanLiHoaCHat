/*
# Add COA file support to lots

## Overview
Adds a `coa_url` column to the `lots` table to store the URL of an uploaded
Certificate of Analysis (COA) PDF/file. Also creates a public storage bucket
for COA file uploads.

## Modified Tables
- **lots**: added `coa_url` (text, nullable). Stores the public URL of the
  uploaded COA file in Supabase Storage.

## Storage
- Creates a public bucket named `coa_files` for storing COA documents.

## Security
- No RLS policy changes needed — existing lot policies already allow
  authenticated users to SELECT/UPDATE lots.
- Storage bucket is public so files can be viewed/downloaded via URL.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lots' AND column_name = 'coa_url'
  ) THEN
    ALTER TABLE lots ADD COLUMN coa_url text;
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('coa_files', 'coa_files', true)
ON CONFLICT (id) DO NOTHING;
