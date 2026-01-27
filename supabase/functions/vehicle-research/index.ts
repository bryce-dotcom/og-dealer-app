import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// SIMPLIFIED ARCHITECTURE: Values from MarketCheck, Comparables from find-vehicles
// =============================================================================

// Condition multipliers for value adjustments
const CONDITION_MULTIPLIERS: Record<string, number> = {
  'excellent': 1.05,
  'good': 1.00,
  'fair': 0.92,
  'poor': 0.82
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const logs: string[] = [];

function log(category: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] [${category}] ${message}`;
  console.log(logMsg);
  logs.push(logMsg);
  if (data !== undefined) {
    const dataStr = JSON.stringify(data, null, 2);
    console.log(dataStr);
    logs.push(dataStr);
  }
}

// =============================================================================
// STEP 1: VIN DECODE (NHTSA - free)
// =============================================================================

interface VINDecodeResult {
  year: number | null;
  make: string;
  model: string;
  trim: string;
  series: string;
  fuel_type: string;
  engine: string;
  drivetrain: string;
  body_type: string;
  transmission: string;
}

async function decodeVIN(vin: string): Promise<VINDecodeResult | null> {
  if (!vin || vin.length !== 17) return null;

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`;
  log('NHTSA', `Decoding VIN: ${vin}`);

  try {
    const res = await fetch(url);
    const data = await res.json();

    const getValue = (name: string): string => {
      const item = data.Results?.find((r: any) => r.Variable === name);
      if (!item?.Value || item.Value === 'Not Applicable' || item.Value.trim() === '') {
        return '';
      }
      return item.Value.trim();
    };

    const result: VINDecodeResult = {
      year: parseInt(getValue('Model Year')) || null,
      make: getValue('Make'),
      model: getValue('Model'),
      trim: getValue('Trim'),
      series: getValue('Series'),
      fuel_type: getValue('Fuel Type - Primary'),
      engine: `${getValue('Engine Number of Cylinders')}cyl ${getValue('Displacement (L)')}L`,
      drivetrain: getValue('Drive Type'),
      body_type: getValue('Body Class'),
      transmission: getValue('Transmission Style')
    };

    log('NHTSA', `Decoded: ${result.year} ${result.make} ${result.model}`, {
      trim: result.trim,
      series: result.series,
      fuel_type: result.fuel_type,
      engine: result.engine,
      drivetrain: result.drivetrain
    });

    return result;
  } catch (err) {
    log('NHTSA', `Error: ${err.message}`);
    return null;
  }
}

// =============================================================================
// STEP 2: MARKETCHECK PRICE PREDICTION API
// =============================================================================

interface PricePrediction {
  mmr: number | null;
  retail: number | null;
  wholesale: number | null;
  trade_in: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  raw_response: any;
}

async function getMarketCheckPricePrediction(
  apiKey: string,
  params: {
    vin?: string;
    year: number;
    make: string;
    model: string;
    trim?: string;
    miles: number;
    condition: string;
  }
): Promise<PricePrediction> {
  const { vin, year, make, model, trim, miles, condition } = params;

  log('MARKETCHECK', 'Getting price prediction', { vin, year, make, model, trim, miles, condition });

  // Build prediction API params
  const predParams = new URLSearchParams({
    api_key: apiKey,
    car_type: 'used',
  });

  if (vin && vin.length === 17) {
    predParams.set('vin', vin);
    predParams.set('miles', String(miles));
  } else {
    predParams.set('year', String(year));
    predParams.set('make', make.toLowerCase());
    predParams.set('model', model);
    if (trim) predParams.set('trim', trim);
    predParams.set('miles', String(miles));
  }

  const predUrl = `https://mc-api.marketcheck.com/v2/predict/car/price?${predParams.toString()}`;
  log('MARKETCHECK', `Prediction URL: ${predUrl.replace(apiKey, 'KEY_HIDDEN')}`);

  try {
    const predRes = await fetch(predUrl);
    log('MARKETCHECK', `Prediction status: ${predRes.status}`);

    if (!predRes.ok) {
      const errText = await predRes.text();
      log('MARKETCHECK', `Prediction error: ${errText.slice(0, 200)}`);
      return {
        mmr: null,
        retail: null,
        wholesale: null,
        trade_in: null,
        confidence: 'LOW',
        raw_response: { error: errText }
      };
    }

    const predData = await predRes.json();
    log('MARKETCHECK', 'Prediction response', predData);

    // Extract prices from response
    const retailPrice = predData.predicted_price || predData.price || predData.retail_price || predData.adjusted_price;

    if (!retailPrice) {
      log('MARKETCHECK', 'No price in prediction response');
      return {
        mmr: null,
        retail: null,
        wholesale: null,
        trade_in: null,
        confidence: 'LOW',
        raw_response: predData
      };
    }

    // Apply condition adjustment
    const conditionMult = CONDITION_MULTIPLIERS[condition.toLowerCase()] || 1.0;
    const adjustedRetail = Math.round(retailPrice * conditionMult);

    // Calculate other values from retail
    const mmr = Math.round(adjustedRetail * 0.80);
    const wholesale = Math.round(adjustedRetail * 0.82);
    const tradeIn = Math.round(adjustedRetail * 0.73);

    log('MARKETCHECK', 'Calculated values', {
      raw_retail: retailPrice,
      condition_mult: conditionMult,
      adjusted_retail: adjustedRetail,
      mmr,
      wholesale,
      trade_in: tradeIn
    });

    return {
      mmr,
      retail: adjustedRetail,
      wholesale,
      trade_in: tradeIn,
      confidence: 'HIGH',
      raw_response: predData
    };
  } catch (err) {
    log('MARKETCHECK', `Prediction exception: ${err.message}`);
    return {
      mmr: null,
      retail: null,
      wholesale: null,
      trade_in: null,
      confidence: 'LOW',
      raw_response: { error: err.message }
    };
  }
}

// =============================================================================
// STEP 3: MARKETCHECK MARKET STATS
// =============================================================================

interface MarketStats {
  avg_days_on_market: number | null;
  price_trend: 'up' | 'down' | 'stable';
  supply_level: 'low' | 'medium' | 'high';
  active_listings: number;
  price_range: { low: number; high: number } | null;
}

async function getMarketStats(
  apiKey: string,
  params: {
    year: number;
    make: string;
    model: string;
    zip_code: string;
  }
): Promise<MarketStats> {
  const { year, make, model, zip_code } = params;

  log('MARKETCHECK', 'Getting market stats', { year, make, model, zip_code });

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    year: `${year - 1}-${year + 1}`,
    make: make,
    model: model,
    car_type: 'used',
    zip: zip_code,
    radius: '100',
    rows: '1',
    stats: 'price,miles,dom',
  });

  const url = `https://mc-api.marketcheck.com/v2/search/car/active?${searchParams.toString()}`;
  log('MARKETCHECK', `Stats URL: ${url.replace(apiKey, 'KEY_HIDDEN')}`);

  try {
    const res = await fetch(url);

    if (!res.ok) {
      log('MARKETCHECK', `Stats request failed: ${res.status}`);
      return {
        avg_days_on_market: null,
        price_trend: 'stable',
        supply_level: 'medium',
        active_listings: 0,
        price_range: null
      };
    }

    const data = await res.json();
    log('MARKETCHECK', 'Stats response', { num_found: data.num_found, stats: data.stats });

    const stats = data.stats || {};
    const numFound = data.num_found || 0;

    // Determine supply level
    let supplyLevel: 'low' | 'medium' | 'high' = 'medium';
    if (numFound > 100) supplyLevel = 'high';
    else if (numFound < 20) supplyLevel = 'low';

    // Determine price trend from mean vs median
    let priceTrend: 'up' | 'down' | 'stable' = 'stable';
    if (stats.price?.mean && stats.price?.median) {
      const diff = (stats.price.mean - stats.price.median) / stats.price.median;
      if (diff > 0.05) priceTrend = 'up';
      else if (diff < -0.05) priceTrend = 'down';
    }

    return {
      avg_days_on_market: stats.dom?.mean ? Math.round(stats.dom.mean) : null,
      price_trend: priceTrend,
      supply_level: supplyLevel,
      active_listings: numFound,
      price_range: stats.price?.min && stats.price?.max
        ? { low: stats.price.min, high: stats.price.max }
        : null
    };
  } catch (err) {
    log('MARKETCHECK', `Stats exception: ${err.message}`);
    return {
      avg_days_on_market: null,
      price_trend: 'stable',
      supply_level: 'medium',
      active_listings: 0,
      price_range: null
    };
  }
}

// =============================================================================
// STEP 4: CALL FIND-VEHICLES FOR COMPARABLES
// =============================================================================

interface ComparablesResult {
  dealer_listings: any[];
  private_listings: any[];
  market_summary: any;
}

async function getComparables(
  vehicle: {
    year: number;
    make: string;
    model: string;
    trim?: string;
  },
  miles: number,
  zip_code: string
): Promise<ComparablesResult> {
  log('COMPARABLES', 'Calling find-vehicles', { vehicle, miles, zip_code });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    log('COMPARABLES', 'Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return {
      dealer_listings: [],
      private_listings: [],
      market_summary: null
    };
  }

  try {
    const comparablesRes = await fetch(
      SUPABASE_URL + '/functions/v1/find-vehicles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          year_min: vehicle.year - 1,
          year_max: vehicle.year + 1,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          max_miles: (miles || 60000) + 30000,
          zip_code: zip_code || '84065',
          radius_miles: 250,
        }),
      }
    );

    log('COMPARABLES', `find-vehicles status: ${comparablesRes.status}`);

    if (!comparablesRes.ok) {
      const errText = await comparablesRes.text();
      log('COMPARABLES', `find-vehicles error: ${errText.slice(0, 200)}`);
      return {
        dealer_listings: [],
        private_listings: [],
        market_summary: null
      };
    }

    const comparablesData = await comparablesRes.json();
    log('COMPARABLES', `find-vehicles returned ${comparablesData.dealer_listings?.length || 0} dealer, ${comparablesData.private_listings?.length || 0} private`);

    return {
      dealer_listings: comparablesData.dealer_listings || [],
      private_listings: comparablesData.private_listings || [],
      market_summary: comparablesData.market_summary || null
    };
  } catch (err) {
    log('COMPARABLES', `find-vehicles exception: ${err.message}`);
    return {
      dealer_listings: [],
      private_listings: [],
      market_summary: null
    };
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  // Reset logs for each request
  logs.length = 0;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      vin,
      year,
      make,
      model,
      trim,
      miles = 60000,
      condition = 'good',
      zip_code = '84065',
    } = body;

    log('MAIN', '========== NEW REQUEST ==========');
    log('MAIN', 'Request params', { vin, year, make, model, trim, miles, condition, zip_code });

    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");

    if (!MARKETCHECK_API_KEY) {
      throw new Error("MARKETCHECK_API_KEY not configured");
    }

    // =======================================================================
    // STEP 1: Decode VIN (if provided)
    // =======================================================================
    let vehicleInfo: any = { year, make, model, trim, miles };

    if (vin && vin.length === 17) {
      log('MAIN', 'Decoding VIN...');
      const vinData = await decodeVIN(vin);

      if (vinData?.make && vinData?.model) {
        vehicleInfo = {
          vin,
          year: vinData.year || year,
          make: vinData.make || make,
          model: vinData.model || model,
          trim: vinData.trim || trim,
          engine: vinData.engine,
          fuel_type: vinData.fuel_type,
          drivetrain: vinData.drivetrain,
          body_type: vinData.body_type,
          transmission: vinData.transmission,
          miles
        };
        log('MAIN', 'VIN decoded successfully', vehicleInfo);
      }
    }

    const searchYear = vehicleInfo.year || year;
    const searchMake = vehicleInfo.make || make;
    const searchModel = vehicleInfo.model || model;
    const searchTrim = vehicleInfo.trim || trim || '';

    if (!searchYear || !searchMake || !searchModel) {
      throw new Error("Year, Make, and Model are required (provide VIN or manual entry)");
    }

    log('MAIN', `Researching: ${searchYear} ${searchMake} ${searchModel} ${searchTrim}`);

    // =======================================================================
    // STEP 2: Get Price Prediction from MarketCheck
    // =======================================================================
    log('MAIN', 'Getting price prediction...');
    const pricePrediction = await getMarketCheckPricePrediction(MARKETCHECK_API_KEY, {
      vin: vin,
      year: parseInt(searchYear.toString()),
      make: searchMake,
      model: searchModel,
      trim: searchTrim,
      miles: miles,
      condition: condition
    });

    // =======================================================================
    // STEP 3: Get Market Stats from MarketCheck
    // =======================================================================
    log('MAIN', 'Getting market stats...');
    const marketStats = await getMarketStats(MARKETCHECK_API_KEY, {
      year: parseInt(searchYear.toString()),
      make: searchMake,
      model: searchModel,
      zip_code: zip_code
    });

    // =======================================================================
    // STEP 4: Get Comparables from find-vehicles
    // =======================================================================
    log('MAIN', 'Getting comparables from find-vehicles...');
    const comparables = await getComparables(
      {
        year: parseInt(searchYear.toString()),
        make: searchMake,
        model: searchModel,
        trim: searchTrim
      },
      miles,
      zip_code
    );

    // =======================================================================
    // STEP 5: Build Response
    // =======================================================================
    const response = {
      success: true,

      vehicle: {
        vin: vehicleInfo.vin || null,
        year: searchYear,
        make: searchMake,
        model: searchModel,
        trim: searchTrim,
        engine: vehicleInfo.engine || null,
        fuel_type: vehicleInfo.fuel_type || null,
        drivetrain: vehicleInfo.drivetrain || null,
        body_type: vehicleInfo.body_type || null,
        transmission: vehicleInfo.transmission || null,
        miles: miles,
        condition: condition
      },

      values: {
        mmr: pricePrediction.mmr,
        wholesale: pricePrediction.wholesale,
        retail: pricePrediction.retail,
        trade_in: pricePrediction.trade_in,
        confidence: pricePrediction.confidence
      },

      market_stats: {
        avg_days_on_market: marketStats.avg_days_on_market,
        price_trend: marketStats.price_trend,
        supply_level: marketStats.supply_level,
        active_listings: marketStats.active_listings,
        price_range: marketStats.price_range
      },

      comparables: {
        dealer_listings: comparables.dealer_listings,
        private_listings: comparables.private_listings,
        market_summary: comparables.market_summary
      },

      data_source: 'MarketCheck + find-vehicles',
      logs: logs
    };

    log('MAIN', 'Response built', {
      values: response.values,
      dealer_count: comparables.dealer_listings.length,
      private_count: comparables.private_listings.length
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    log('ERROR', error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs: logs
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
