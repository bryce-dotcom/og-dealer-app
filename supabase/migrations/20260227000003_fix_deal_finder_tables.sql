-- Fix Deal Finder tables schema issues
-- Issue 1: dealer_id should be integer, not UUID (dealer_settings.id is integer)
-- Issue 2: Missing vehicle search columns (bed_length, engine_type, etc.)

-- First, check if tables exist and what type dealer_id is
DO $$
BEGIN
  -- Fix saved_vehicle_searches table
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'saved_vehicle_searches') THEN

    -- Check if dealer_id is UUID (wrong type)
    IF EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'saved_vehicle_searches'
        AND column_name = 'dealer_id'
        AND data_type = 'uuid'
    ) THEN
      -- Drop and recreate with correct types
      RAISE NOTICE 'Recreating saved_vehicle_searches with correct dealer_id type...';

      DROP TABLE IF EXISTS saved_vehicle_searches CASCADE;

      CREATE TABLE saved_vehicle_searches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

        -- Search details
        name text NOT NULL,

        -- Vehicle criteria
        year_min integer,
        year_max integer,
        make text NOT NULL,
        model text,
        trim text,
        engine_type text,
        drivetrain text,
        transmission text,
        body_type text,
        cab_type text,
        bed_length text,
        max_price integer,
        max_miles integer,

        -- Location
        zip_code text DEFAULT '84065',
        radius_miles integer DEFAULT 250,

        -- Preferences
        bhph_preferred boolean DEFAULT false,

        -- Status
        active boolean DEFAULT true,
        last_run_at timestamp with time zone,

        -- Metadata
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),

        CONSTRAINT valid_year_range CHECK (year_min IS NULL OR year_max IS NULL OR year_min <= year_max),
        CONSTRAINT valid_price CHECK (max_price IS NULL OR max_price > 0),
        CONSTRAINT valid_miles CHECK (max_miles IS NULL OR max_miles > 0),
        CONSTRAINT valid_radius CHECK (radius_miles > 0 AND radius_miles <= 500)
      );

      -- Create indexes
      CREATE INDEX idx_saved_searches_dealer ON saved_vehicle_searches(dealer_id);
      CREATE INDEX idx_saved_searches_active ON saved_vehicle_searches(dealer_id, active) WHERE active = true;

      -- Enable RLS
      ALTER TABLE saved_vehicle_searches ENABLE ROW LEVEL SECURITY;

      -- Create RLS policies
      CREATE POLICY saved_searches_select ON saved_vehicle_searches
        FOR SELECT USING (dealer_id = current_setting('app.current_dealer_id')::integer);

      CREATE POLICY saved_searches_insert ON saved_vehicle_searches
        FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id')::integer);

      CREATE POLICY saved_searches_update ON saved_vehicle_searches
        FOR UPDATE USING (dealer_id = current_setting('app.current_dealer_id')::integer);

      CREATE POLICY saved_searches_delete ON saved_vehicle_searches
        FOR DELETE USING (dealer_id = current_setting('app.current_dealer_id')::integer);

    ELSE
      -- dealer_id is already correct type (integer), just add missing columns
      RAISE NOTICE 'Adding missing columns to saved_vehicle_searches...';

      ALTER TABLE saved_vehicle_searches
        ADD COLUMN IF NOT EXISTS engine_type text,
        ADD COLUMN IF NOT EXISTS drivetrain text,
        ADD COLUMN IF NOT EXISTS transmission text,
        ADD COLUMN IF NOT EXISTS body_type text,
        ADD COLUMN IF NOT EXISTS cab_type text,
        ADD COLUMN IF NOT EXISTS bed_length text;
    END IF;

  ELSE
    -- Table doesn't exist, create it from scratch
    RAISE NOTICE 'Creating saved_vehicle_searches table...';

    CREATE TABLE saved_vehicle_searches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,

      -- Search details
      name text NOT NULL,

      -- Vehicle criteria
      year_min integer,
      year_max integer,
      make text NOT NULL,
      model text,
      trim text,
      engine_type text,
      drivetrain text,
      transmission text,
      body_type text,
      cab_type text,
      bed_length text,
      max_price integer,
      max_miles integer,

      -- Location
      zip_code text DEFAULT '84065',
      radius_miles integer DEFAULT 250,

      -- Preferences
      bhph_preferred boolean DEFAULT false,

      -- Status
      active boolean DEFAULT true,
      last_run_at timestamp with time zone,

      -- Metadata
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),

      CONSTRAINT valid_year_range CHECK (year_min IS NULL OR year_max IS NULL OR year_min <= year_max),
      CONSTRAINT valid_price CHECK (max_price IS NULL OR max_price > 0),
      CONSTRAINT valid_miles CHECK (max_miles IS NULL OR max_miles > 0),
      CONSTRAINT valid_radius CHECK (radius_miles > 0 AND radius_miles <= 500)
    );

    CREATE INDEX idx_saved_searches_dealer ON saved_vehicle_searches(dealer_id);
    CREATE INDEX idx_saved_searches_active ON saved_vehicle_searches(dealer_id, active) WHERE active = true;

    ALTER TABLE saved_vehicle_searches ENABLE ROW LEVEL SECURITY;

    CREATE POLICY saved_searches_select ON saved_vehicle_searches
      FOR SELECT USING (dealer_id = current_setting('app.current_dealer_id')::integer);

    CREATE POLICY saved_searches_insert ON saved_vehicle_searches
      FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id')::integer);

    CREATE POLICY saved_searches_update ON saved_vehicle_searches
      FOR UPDATE USING (dealer_id = current_setting('app.current_dealer_id')::integer);

    CREATE POLICY saved_searches_delete ON saved_vehicle_searches
      FOR DELETE USING (dealer_id = current_setting('app.current_dealer_id')::integer);
  END IF;

  -- Fix deal_alerts table dealer_id type
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'deal_alerts') THEN
    IF EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_name = 'deal_alerts'
        AND column_name = 'dealer_id'
        AND data_type = 'uuid'
    ) THEN
      RAISE NOTICE 'Recreating deal_alerts with correct dealer_id type...';

      DROP TABLE IF EXISTS deal_alerts CASCADE;

      CREATE TABLE deal_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealer_id integer NOT NULL REFERENCES dealer_settings(id) ON DELETE CASCADE,
        search_id uuid REFERENCES saved_vehicle_searches(id) ON DELETE SET NULL,

        -- Vehicle information
        year integer,
        make text,
        model text,
        trim text,
        vin text,
        price integer,
        miles integer,
        location text,
        url text,
        source text,
        exterior_color text,
        seller_type text,
        dealer_name text,
        thumbnail text,

        -- Valuation data
        mmr integer,
        market_value integer,
        trade_in_value integer,
        wholesale_value integer,
        deal_score text,
        savings integer,
        savings_percentage numeric(5,2),

        -- AI Analysis
        estimated_profit integer,
        estimated_recon_cost integer,
        estimated_holding_cost integer,
        bhph_score integer,
        recommendation text,
        confidence_score integer,
        ai_reasoning jsonb,

        -- Deal status
        status text DEFAULT 'new',
        notes text,

        -- Timestamps
        created_at timestamp with time zone DEFAULT now(),
        viewed_at timestamp with time zone,
        actioned_at timestamp with time zone,
        expires_at timestamp with time zone DEFAULT now() + interval '7 days',

        CONSTRAINT valid_bhph_score CHECK (bhph_score IS NULL OR (bhph_score >= 1 AND bhph_score <= 10)),
        CONSTRAINT valid_confidence CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 100)),
        CONSTRAINT valid_status CHECK (status IN ('new', 'viewed', 'interested', 'passed', 'purchased'))
      );

      CREATE INDEX idx_deal_alerts_dealer ON deal_alerts(dealer_id);
      CREATE INDEX idx_deal_alerts_search ON deal_alerts(search_id);
      CREATE INDEX idx_deal_alerts_status ON deal_alerts(dealer_id, status);
      CREATE INDEX idx_deal_alerts_created ON deal_alerts(created_at DESC);
      CREATE INDEX idx_deal_alerts_new ON deal_alerts(dealer_id, created_at DESC) WHERE status = 'new';

      ALTER TABLE deal_alerts ENABLE ROW LEVEL SECURITY;

      CREATE POLICY deal_alerts_select ON deal_alerts
        FOR SELECT USING (dealer_id = current_setting('app.current_dealer_id')::integer);

      CREATE POLICY deal_alerts_insert ON deal_alerts
        FOR INSERT WITH CHECK (true); -- Service role inserts

      CREATE POLICY deal_alerts_update ON deal_alerts
        FOR UPDATE USING (dealer_id = current_setting('app.current_dealer_id')::integer);

      CREATE POLICY deal_alerts_delete ON deal_alerts
        FOR DELETE USING (dealer_id = current_setting('app.current_dealer_id')::integer);
    END IF;
  END IF;

END $$;

-- Verify tables
SELECT
  'saved_vehicle_searches' as table_name,
  EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'saved_vehicle_searches') as exists,
  (SELECT data_type FROM information_schema.columns WHERE table_name = 'saved_vehicle_searches' AND column_name = 'dealer_id') as dealer_id_type
UNION ALL
SELECT
  'deal_alerts',
  EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'deal_alerts'),
  (SELECT data_type FROM information_schema.columns WHERE table_name = 'deal_alerts' AND column_name = 'dealer_id');
