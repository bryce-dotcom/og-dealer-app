-- =============================================
-- Add specific search fields to saved_vehicle_searches
-- =============================================
-- This allows dealers to filter by engine type (diesel vs gas),
-- drivetrain, transmission, body type, etc. to avoid irrelevant alerts

ALTER TABLE saved_vehicle_searches
  ADD COLUMN IF NOT EXISTS engine_type TEXT, -- 'gas', 'diesel', 'electric', 'hybrid', 'flex-fuel'
  ADD COLUMN IF NOT EXISTS drivetrain TEXT,  -- '2WD', '4WD', 'AWD'
  ADD COLUMN IF NOT EXISTS transmission TEXT, -- 'automatic', 'manual', 'CVT'
  ADD COLUMN IF NOT EXISTS body_type TEXT,    -- 'sedan', 'coupe', 'SUV', 'truck', 'van', 'wagon', 'hatchback'
  ADD COLUMN IF NOT EXISTS cab_type TEXT,     -- 'crew cab', 'extended cab', 'regular cab', 'mega cab' (for trucks)
  ADD COLUMN IF NOT EXISTS bed_length TEXT;   -- 'short', 'standard', 'long' (for trucks)

-- Add index for common filters
CREATE INDEX IF NOT EXISTS idx_saved_searches_filters ON saved_vehicle_searches(dealer_id, active, engine_type, drivetrain);

-- =============================================
-- NOTES:
-- =============================================
-- These fields are all optional (nullable) to maintain backward compatibility
-- Existing saved searches will have NULL for these fields (meaning "any")
-- When filtering, NULL means "don't filter by this field"
--
-- Example: A search for "Ram 2500 Diesel 4WD" would have:
--   make = 'Ram', model = '2500', engine_type = 'diesel', drivetrain = '4WD'
-- =============================================
