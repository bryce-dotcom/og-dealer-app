-- Add additional_markets column to saved_vehicle_searches
-- Allows searching multiple markets (100 mile radius each) to cover larger area

ALTER TABLE saved_vehicle_searches
  ADD COLUMN IF NOT EXISTS additional_markets text[];

COMMENT ON COLUMN saved_vehicle_searches.additional_markets IS 'Array of additional zip codes to search (each 100 mile radius). Format: ["84101", "84601", "89101"]';

-- Example: Primary zip 84003 + additional markets ["84101", "89101"]
-- searches American Fork (100mi) + Salt Lake (100mi) + Las Vegas (100mi) = ~500 mile coverage
