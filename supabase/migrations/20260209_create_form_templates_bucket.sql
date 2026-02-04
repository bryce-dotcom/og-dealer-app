-- Create storage bucket for form template PDFs
-- This bucket stores the actual PDF files downloaded from DMV sources

INSERT INTO storage.buckets (id, name, public)
VALUES ('form-templates', 'form-templates', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to form-templates bucket
DROP POLICY IF EXISTS "form_templates_public_select" ON storage.objects;
CREATE POLICY "form_templates_public_select" ON storage.objects
FOR SELECT USING (bucket_id = 'form-templates');

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "form_templates_authenticated_insert" ON storage.objects;
CREATE POLICY "form_templates_authenticated_insert" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'form-templates');

-- Allow service role to do anything (for edge functions)
DROP POLICY IF EXISTS "form_templates_service_all" ON storage.objects;
CREATE POLICY "form_templates_service_all" ON storage.objects
USING (bucket_id = 'form-templates' AND auth.role() = 'service_role');
