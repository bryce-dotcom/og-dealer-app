-- Ensure dealer-forms bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('dealer-forms', 'dealer-forms', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for dealer-forms bucket
CREATE POLICY "Allow uploads to dealer-forms" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'dealer-forms');

CREATE POLICY "Allow reads from dealer-forms" ON storage.objects
FOR SELECT USING (bucket_id = 'dealer-forms');

CREATE POLICY "Allow deletes from dealer-forms" ON storage.objects
FOR DELETE USING (bucket_id = 'dealer-forms');

-- Disable RLS on dealer_custom_forms (we filter by dealer_id in app code)
ALTER TABLE dealer_custom_forms DISABLE ROW LEVEL SECURITY;
