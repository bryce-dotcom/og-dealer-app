-- Dealer-specific custom form uploads
CREATE TABLE IF NOT EXISTS dealer_custom_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id INTEGER REFERENCES dealer_settings(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  form_number TEXT,
  category TEXT DEFAULT 'custom',
  description TEXT,
  storage_bucket TEXT DEFAULT 'dealer-forms',
  storage_path TEXT,
  file_size_bytes INTEGER,
  is_fillable BOOLEAN DEFAULT true,
  detected_fields JSONB DEFAULT '[]',
  field_mappings JSONB DEFAULT '[]',
  mapping_confidence INTEGER DEFAULT 0,
  mapping_status TEXT DEFAULT 'unmapped',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create storage bucket for dealer forms (will be no-op if exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dealer-forms', 'dealer-forms', true)
ON CONFLICT (id) DO NOTHING;
