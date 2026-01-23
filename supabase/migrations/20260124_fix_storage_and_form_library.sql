-- Check and fix form_library table schema
-- Add any missing columns

-- Ensure detected_fields column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS detected_fields jsonb DEFAULT '[]'::jsonb;

-- Ensure field_mapping column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS field_mapping jsonb DEFAULT '{}'::jsonb;

-- Ensure mapping_confidence column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS mapping_confidence integer DEFAULT 0;

-- Ensure mapping_status column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS mapping_status text DEFAULT 'pending';

-- Ensure is_active column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Ensure category column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS category text DEFAULT 'deal';

-- Ensure county column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS county text;

-- Ensure description column exists
ALTER TABLE form_library
ADD COLUMN IF NOT EXISTS description text;

-- Create storage bucket for form PDFs if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-pdfs', 'form-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to form-pdfs bucket (drop first if exists)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
FOR SELECT USING (bucket_id = 'form-pdfs');

DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'form-pdfs');

DROP POLICY IF EXISTS "Authenticated Update" ON storage.objects;
CREATE POLICY "Authenticated Update" ON storage.objects
FOR UPDATE USING (bucket_id = 'form-pdfs');

DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
CREATE POLICY "Authenticated Delete" ON storage.objects
FOR DELETE USING (bucket_id = 'form-pdfs');
