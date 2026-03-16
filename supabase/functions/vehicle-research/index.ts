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
    fuel_type?: string;
    drivetrain?: string;
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

  // Map NHTSA fuel type to engine_type filter
  let engineType: string | undefined;
  if (vehicle.fuel_type) {
    const ft = vehicle.fuel_type.toLowerCase();
    if (ft.includes('diesel')) engineType = 'diesel';
    else if (ft.includes('electric')) engineType = 'electric';
    else if (ft.includes('hybrid') || ft.includes('plug-in')) engineType = 'hybrid';
    else if (ft.includes('gasoline') || ft.includes('gas')) engineType = 'gas';
  }

  // Map NHTSA drivetrain to filter
  let driveFilter: string | undefined;
  if (vehicle.drivetrain) {
    const dt = vehicle.drivetrain.toLowerCase();
    if (dt.includes('4wd') || dt.includes('4x4') || dt.includes('four wheel') || dt.includes('part-time')) driveFilter = '4WD';
    else if (dt.includes('awd') || dt.includes('all wheel') || dt.includes('all-wheel')) driveFilter = 'AWD';
    else if (dt.includes('2wd') || dt.includes('rear wheel') || dt.includes('front wheel') || dt.includes('rwd') || dt.includes('fwd')) driveFilter = '2WD';
  }

  try {
    const requestBody: any = {
      year_min: vehicle.year - 1,
      year_max: vehicle.year + 1,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      max_miles: (miles || 60000) + 30000,
      zip_code: zip_code || '84065',
      radius_miles: 250,
    };

    // Pass fuel type and drivetrain filters
    if (engineType) requestBody.engine_type = engineType;
    if (driveFilter) requestBody.drivetrain = driveFilter;

    log('COMPARABLES', 'find-vehicles request body', requestBody);

    const comparablesRes = await fetch(
      SUPABASE_URL + '/functions/v1/find-vehicles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(requestBody),
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
      color,
      purchase_price,
      zip_code = '84065',
    } = body;

    log('MAIN', '========== NEW REQUEST ==========');
    log('MAIN', 'Request params', { vin, year, make, model, trim, miles, condition, color, purchase_price, zip_code });

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
        trim: searchTrim,
        fuel_type: vehicleInfo.fuel_type || '',
        drivetrain: vehicleInfo.drivetrain || '',
      },
      miles,
      zip_code
    );

    // =======================================================================
    // STEP 5: Fallback — calculate values from comparables if MarketCheck failed
    // =======================================================================
    let finalValues = {
      mmr: pricePrediction.mmr,
      wholesale: pricePrediction.wholesale,
      retail: pricePrediction.retail,
      trade_in: pricePrediction.trade_in,
      confidence: pricePrediction.confidence
    };
    let dataSource = 'MarketCheck + find-vehicles';

    if (!finalValues.retail) {
      log('FALLBACK', 'MarketCheck returned no values, calculating from comparables...');

      // Gather all listings
      const allListings = [
        ...(comparables.dealer_listings || []),
        ...(comparables.private_listings || [])
      ];

      // ---- TRIM-MATCHING: Filter comparables by trim similarity ----
      // Premium trims (Platinum, Limited, Denali) are worth significantly more than base trims
      const trimKeywords: Record<string, string[]> = {
        // Premium
        'platinum': ['platinum'],
        'limited': ['limited'],
        'denali': ['denali'],
        'king ranch': ['king ranch', 'king-ranch'],
        'lariat': ['lariat'],
        'high country': ['high country'],
        'overland': ['overland'],
        'summit': ['summit'],
        'longhorn': ['longhorn'],
        'laramie': ['laramie'],
        'tungsten': ['tungsten'],
        'calligraphy': ['calligraphy'],
        // Mid
        'xlt': ['xlt'],
        'slt': ['slt'],
        'lt': [' lt ', ' lt,'],
        'sel': ['sel'],
        'sport': ['sport'],
        'trail boss': ['trail boss'],
        'tremor': ['tremor'],
        'trd': ['trd'],
        'sr5': ['sr5'],
        // Base
        'xl': [' xl ', ' xl,'],
        'ls': [' ls ', ' ls,'],
        'se': [' se ', ' se,'],
        'base': ['base'],
        'work truck': ['work truck', 'wt', 'w/t'],
        'tradesman': ['tradesman'],
      };

      // Classify our target trim into a tier
      function getTrimTier(trimStr: string): 'premium' | 'mid' | 'base' | 'unknown' {
        const t = (trimStr || '').toLowerCase();
        const premiumTrims = ['platinum', 'limited', 'denali', 'king ranch', 'lariat', 'high country', 'overland', 'summit', 'longhorn', 'laramie', 'tungsten', 'calligraphy'];
        const baseTrims = ['xl', 'ls', 'se', 'base', 'work truck', 'wt', 'w/t', 'tradesman', 's ', 'fleet'];

        for (const pt of premiumTrims) {
          if (t.includes(pt)) return 'premium';
        }
        for (const bt of baseTrims) {
          if (t.includes(bt)) return 'base';
        }
        if (t.length > 0) return 'mid';
        return 'unknown';
      }

      const targetTrim = searchTrim.toLowerCase();
      const targetTier = getTrimTier(searchTrim);
      log('FALLBACK', `Target trim: "${searchTrim}", tier: ${targetTier}`);

      // Score each listing by trim relevance
      function trimMatchScore(listing: any): number {
        const listingText = `${listing.title || ''} ${listing.trim || ''} ${listing.model || ''}`.toLowerCase();

        // Exact trim match = best
        if (targetTrim && listingText.includes(targetTrim)) return 3;

        // Same tier match = good
        const listingTier = getTrimTier(listingText);
        if (targetTier !== 'unknown' && listingTier === targetTier) return 2;

        // Unknown tier (can't determine) = acceptable
        if (listingTier === 'unknown') return 1;

        // Different tier = poor match
        return 0;
      }

      // Score each listing by overall relevance (trim + mileage + year)
      const targetYear = parseInt(searchYear.toString());
      const targetMiles = miles || 60000;

      const scoredListings = allListings
        .filter((l: any) => {
          const p = parseFloat(l.price);
          return p > 0 && !isNaN(p);
        })
        .map((l: any) => {
          const tScore = trimMatchScore(l);

          // Year proximity score (0-2): exact year=2, ±1 year=1, further=0
          const listingYear = l.year || targetYear;
          const yearDiff = Math.abs(listingYear - targetYear);
          const yScore = yearDiff === 0 ? 2 : yearDiff === 1 ? 1 : 0;

          // Mileage proximity score (0-2): within 15k=2, within 30k=1, further=0
          const listingMiles = l.miles || targetMiles;
          const milesDiff = Math.abs(listingMiles - targetMiles);
          const mScore = milesDiff <= 15000 ? 2 : milesDiff <= 30000 ? 1 : 0;

          // Combined relevance (trim is weighted heaviest: 0-3, year: 0-2, miles: 0-2)
          const totalScore = tScore * 3 + yScore + mScore; // max = 9+2+2 = 13

          return { ...l, _trimScore: tScore, _yearScore: yScore, _milesScore: mScore, _totalScore: totalScore };
        });

      // Sort by total relevance score descending
      scoredListings.sort((a: any, b: any) => b._totalScore - a._totalScore);

      // Prefer well-matched listings, fall back progressively
      let bestListings = scoredListings.filter((l: any) => l._totalScore >= 7); // good trim + close year/miles
      if (bestListings.length < 3) {
        bestListings = scoredListings.filter((l: any) => l._totalScore >= 4); // decent trim match
      }
      if (bestListings.length < 3) {
        bestListings = scoredListings.filter((l: any) => l._trimScore >= 1); // at least some trim relevance
      }
      if (bestListings.length < 3) {
        bestListings = scoredListings; // use everything
      }

      const exactTrimMatches = scoredListings.filter((l: any) => l._trimScore >= 2).length;
      log('FALLBACK', `Scoring: ${scoredListings.length} total priced, ${bestListings.length} best matches, ${exactTrimMatches} exact trim matches`);
      if (bestListings.length > 0) {
        log('FALLBACK', `Top match scores: ${bestListings.slice(0, 5).map((l: any) => `${l.title?.slice(0, 30) || '?'}=$${l.price} (t:${l._trimScore} y:${l._yearScore} m:${l._milesScore} total:${l._totalScore})`).join(', ')}`);
      }

      const prices = bestListings
        .map((l: any) => parseFloat(l.price))
        .sort((a: number, b: number) => a - b);

      if (prices.length >= 3) {
        // Remove outliers (bottom 10% and top 10%)
        const trimCount = Math.max(1, Math.floor(prices.length * 0.1));
        const trimmedPrices = prices.slice(trimCount, prices.length - trimCount);

        // Weighted average — give more weight to better-matched listings
        const weightedListings = bestListings
          .filter((l: any) => {
            const p = parseFloat(l.price);
            return p > 0 && !isNaN(p);
          })
          .sort((a: any, b: any) => b._totalScore - a._totalScore);

        let weightedSum = 0;
        let weightTotal = 0;
        for (const l of weightedListings) {
          const w = l._totalScore + 1; // +1 so even score=0 has some weight
          weightedSum += parseFloat(l.price) * w;
          weightTotal += w;
        }
        const weightedAvg = weightTotal > 0 ? weightedSum / weightTotal : 0;

        const median = trimmedPrices[Math.floor(trimmedPrices.length / 2)];

        // Blend weighted average and median (weighted avg is more accurate when good matches exist)
        const hasGoodMatches = exactTrimMatches >= 3;
        const baseValue = hasGoodMatches
          ? Math.round(weightedAvg * 0.6 + median * 0.4) // favor weighted when good matches
          : Math.round(weightedAvg * 0.3 + median * 0.7); // favor median when matches are weak

        // Apply condition multiplier
        const conditionMult = CONDITION_MULTIPLIERS[condition.toLowerCase()] || 1.0;

        // Apply mileage adjustment — comparables may have different miles
        // Roughly $0.05-0.15 per mile difference depending on vehicle value
        const avgComparableMiles = weightedListings.reduce((s: number, l: any) => s + (l.miles || targetMiles), 0) / weightedListings.length;
        const milesDelta = targetMiles - avgComparableMiles; // positive = our car has MORE miles
        const perMileRate = baseValue > 40000 ? 0.12 : baseValue > 20000 ? 0.08 : 0.05;
        const milesAdjustment = Math.round(milesDelta * perMileRate * -1); // more miles = lower value

        const retailEstimate = Math.round((baseValue + milesAdjustment) * conditionMult);

        // Confidence scoring
        let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
        if (exactTrimMatches >= 5 && bestListings.length >= 8) confidence = 'HIGH';
        else if (exactTrimMatches >= 3 || bestListings.length >= 10) confidence = 'MEDIUM';

        finalValues = {
          retail: retailEstimate,
          mmr: Math.round(retailEstimate * 0.80),
          wholesale: Math.round(retailEstimate * 0.82),
          trade_in: Math.round(retailEstimate * 0.73),
          confidence
        };

        const trimNote = exactTrimMatches > 0 ? `, ${exactTrimMatches} trim-matched` : '';
        dataSource = `Comparables (${prices.length} listings${trimNote})`;

        log('FALLBACK', 'Calculated from comparables', {
          total_prices: prices.length,
          exact_trim_matches: exactTrimMatches,
          weighted_avg: Math.round(weightedAvg),
          median,
          base_value: baseValue,
          miles_adjustment: milesAdjustment,
          avg_comparable_miles: Math.round(avgComparableMiles),
          target_miles: targetMiles,
          condition_mult: conditionMult,
          estimated_retail: retailEstimate,
          price_range: { low: prices[0], high: prices[prices.length - 1] }
        });
      } else if (prices.length > 0) {
        // Too few listings, just use average
        const avg = prices.reduce((s: number, p: number) => s + p, 0) / prices.length;
        const conditionMult = CONDITION_MULTIPLIERS[condition.toLowerCase()] || 1.0;
        const retailEstimate = Math.round(avg * conditionMult);

        finalValues = {
          retail: retailEstimate,
          mmr: Math.round(retailEstimate * 0.80),
          wholesale: Math.round(retailEstimate * 0.82),
          trade_in: Math.round(retailEstimate * 0.73),
          confidence: 'LOW' as const
        };

        dataSource = `Comparables (${prices.length} listings, low confidence)`;
        log('FALLBACK', `Only ${prices.length} priced listings, low confidence`, { avg, retail: retailEstimate });
      } else {
        log('FALLBACK', 'No priced listings available for fallback');
      }
    }

    // Also build market stats from comparables if MarketCheck stats failed
    let finalMarketStats = {
      avg_days_on_market: marketStats.avg_days_on_market,
      price_trend: marketStats.price_trend,
      supply_level: marketStats.supply_level,
      active_listings: marketStats.active_listings,
      price_range: marketStats.price_range
    };

    if (!finalMarketStats.active_listings && comparables.private_listings?.length > 0) {
      const allListings = [...(comparables.dealer_listings || []), ...(comparables.private_listings || [])];
      const prices = allListings.map((l: any) => parseFloat(l.price)).filter((p: number) => p > 0 && !isNaN(p)).sort((a: number, b: number) => a - b);

      finalMarketStats = {
        avg_days_on_market: null,
        price_trend: 'stable' as const,
        supply_level: allListings.length > 50 ? 'high' as const : allListings.length > 15 ? 'medium' as const : 'low' as const,
        active_listings: allListings.length,
        price_range: prices.length > 0 ? { low: prices[0], high: prices[prices.length - 1] } : null
      };
    }

    // =======================================================================
    // STEP 6: Build Response
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

      values: finalValues,

      market_stats: finalMarketStats,

      comparables: {
        dealer_listings: comparables.dealer_listings,
        private_listings: comparables.private_listings,
        market_summary: comparables.market_summary
      },

      data_source: dataSource,
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
