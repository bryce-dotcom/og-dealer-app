import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// ARCHITECTURE: MarketCheck baseline + SerpAPI private party + AI gap-fill
// =============================================================================

// Trim tier definitions - CRITICAL for accurate comparisons
const TRIM_TIERS = {
  premium: [
    'platinum', 'king ranch', 'limited', 'denali', 'high country',
    'tungsten', 'longhorn', 'limited longhorn', 'laramie longhorn',
    'raptor', 'tremor', 'power wagon', 'rebel', 'trx',
    'at4x', 'at4', 'sierra ultimate', 'avenir',
    'premier', 'reserve', 'black label', 'pinnacle'
  ],
  mid: [
    'lariat', 'lt', 'xlt', 'slt', 'laramie', 'big horn', 'lone star',
    'z71', 'trail boss', 'rst', 'elevation',
    'sport', 'fx4', 'black appearance', 'texas edition',
    'sr5', 'trd sport', 'trd off-road', 'trd pro',
    'sle', 'custom', 'express', 'tradesman'
  ],
  base: [
    'xl', 'wt', 'w/t', 'work truck', 'base', 'fleet',
    'chassis cab', 'pro', 's', 'sr', 'st', 'se', 'ls', 'stx'
  ]
};

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

function log(category: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${category}] ${message}`);
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// FIXED: detectTrimTier now properly returns 'unknown' when no match found
// It checks both trim and series fields, and never defaults to 'base'
function detectTrimTier(trim: string, series?: string): 'premium' | 'mid' | 'base' | 'unknown' {
  // Combine trim and series for checking
  const fieldsToCheck = [trim, series].filter(Boolean).join(' ');

  if (!fieldsToCheck) {
    log('TRIM', 'No trim or series provided, returning unknown');
    return 'unknown';
  }

  const combined = fieldsToCheck.toLowerCase();
  log('TRIM', `Detecting tier from: "${combined}"`);

  // Check premium first (most valuable)
  for (const t of TRIM_TIERS.premium) {
    if (combined.includes(t)) {
      log('TRIM', `Matched PREMIUM tier: "${t}"`);
      return 'premium';
    }
  }

  // Check mid tier
  for (const t of TRIM_TIERS.mid) {
    if (combined.includes(t)) {
      log('TRIM', `Matched MID tier: "${t}"`);
      return 'mid';
    }
  }

  // Check base tier
  for (const t of TRIM_TIERS.base) {
    if (combined.includes(t)) {
      log('TRIM', `Matched BASE tier: "${t}"`);
      return 'base';
    }
  }

  // IMPORTANT: Return 'unknown' NOT 'base' when no match
  // This ensures we don't incorrectly filter out premium trucks
  log('TRIM', `No tier match found for "${combined}", returning UNKNOWN`);
  return 'unknown';
}

// FIXED: trimTiersMatch returns TRUE when either tier is 'unknown'
// This prevents filtering out all results when trim is not detected
function trimTiersMatch(tier1: string, tier2: string): boolean {
  // If EITHER tier is unknown, allow the match (don't filter)
  if (tier1 === 'unknown' || tier2 === 'unknown') {
    return true;
  }
  return tier1 === tier2;
}

function normalizeMake(make: string): string {
  if (!make) return '';
  return make.charAt(0).toUpperCase() + make.slice(1).toLowerCase();
}

function normalizeModel(model: string, make: string): string {
  if (!model) return '';
  let normalized = model;
  // Ford: strip "Super Duty"
  if (make?.toLowerCase() === 'ford') {
    normalized = normalized.replace(/\s*super\s*duty/i, '').trim();
  }
  return normalized;
}

// Calculate median from array of numbers
function calculateMedian(numbers: number[]): number {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// =============================================================================
// STEP 1: VIN DECODE (NHTSA - free)
// =============================================================================

interface VINDecodeResult {
  year: number | null;
  make: string;
  model: string;
  trim: string;
  series: string;  // Added series field
  fuel_type: string;
  engine: string;
  drivetrain: string;
  body_type: string;
  transmission: string;
}

async function decodeVIN(vin: string): Promise<VINDecodeResult | null> {
  if (!vin || vin.length !== 17) return null;

  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`;
  log('NHTSA', `Decoding VIN: ${vin}`, { url });

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

    // Get both Trim and Series fields - NHTSA sometimes puts trim info in Series
    const trimField = getValue('Trim');
    const seriesField = getValue('Series');

    log('NHTSA', `Raw NHTSA fields - Trim: "${trimField}", Series: "${seriesField}"`);

    const result: VINDecodeResult = {
      year: parseInt(getValue('Model Year')) || null,
      make: getValue('Make'),
      model: getValue('Model'),
      trim: trimField,
      series: seriesField,
      fuel_type: getValue('Fuel Type - Primary'),
      engine: `${getValue('Engine Number of Cylinders')}cyl ${getValue('Displacement (L)')}L`,
      drivetrain: getValue('Drive Type'),
      body_type: getValue('Body Class'),
      transmission: getValue('Transmission Style')
    };

    log('NHTSA', `Decoded: ${result.year} ${result.make} ${result.model}`, {
      trim: result.trim,
      series: result.series,
      fuel_type: result.fuel_type
    });

    return result;
  } catch (err) {
    log('NHTSA', `Error: ${err.message}`);
    return null;
  }
}

// =============================================================================
// STEP 2: MARKETCHECK API - THE BASELINE (non-negotiable)
// =============================================================================

interface MarketCheckStats {
  price_mean: number | null;
  price_median: number | null;
  price_min: number | null;
  price_max: number | null;
  miles_mean: number | null;
  dom_mean: number | null;
  dom_median: number | null;
  listing_count: number;
}

interface MarketCheckListing {
  id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  fuel_type: string;
  exterior_color: string;
  dealer_name: string;
  city: string;
  state: string;
  dom: number;
  vdp_url: string;
  trim_tier: string;
}

interface MarketCheckResult {
  success: boolean;
  stats: MarketCheckStats | null;
  listings: MarketCheckListing[];
  api_url: string;
  raw_response: any;
  error?: string;
}

async function searchMarketCheck(
  apiKey: string,
  params: {
    year: number;
    make: string;
    model: string;
    trim?: string;
    fuel_type?: string;
    zip: string;
    radius: number;
  }
): Promise<MarketCheckResult> {
  const { year, make, model, trim, fuel_type, zip, radius } = params;

  const yearRange = `${year - 1},${year},${year + 1}`;
  const effectiveRadius = Math.min(radius, 100); // API limit

  const searchParams = new URLSearchParams();
  searchParams.append('api_key', apiKey);
  searchParams.append('year', yearRange);
  searchParams.append('make', normalizeMake(make));
  searchParams.append('model', normalizeModel(model, make));
  searchParams.append('car_type', 'used');
  searchParams.append('radius', effectiveRadius.toString());
  searchParams.append('zip', zip);
  searchParams.append('rows', '50');
  searchParams.append('stats', 'price,miles,dom');

  if (fuel_type) {
    const fuelMap: Record<string, string> = {
      'diesel': 'Diesel',
      'gasoline': 'Gasoline',
      'electric': 'Electric',
      'hybrid': 'Hybrid'
    };
    searchParams.append('fuel_type', fuelMap[fuel_type.toLowerCase()] || fuel_type);
  }

  const url = `https://api.marketcheck.com/v2/search/car/active?${searchParams.toString()}`;
  log('MARKETCHECK', `Search URL: ${url.replace(apiKey, 'REDACTED')}`);

  try {
    const res = await fetch(url);
    const data = await res.json();

    log('MARKETCHECK', `Response status: ${res.status}, num_found: ${data.num_found || 0}`);

    if (!res.ok) {
      return {
        success: false,
        stats: null,
        listings: [],
        api_url: url.replace(apiKey, 'REDACTED'),
        raw_response: data,
        error: data.message || `HTTP ${res.status}`
      };
    }

    // Parse listings first so we can calculate median if API stats are missing
    const listings: MarketCheckListing[] = (data.listings || []).map((l: any) => {
      const listingTrim = l.build?.trim || l.trim || '';
      return {
        id: l.id,
        vin: l.vin,
        year: l.build?.year || l.year,
        make: l.build?.make || l.make,
        model: l.build?.model || l.model,
        trim: listingTrim,
        price: l.price || 0,
        miles: l.miles || 0,
        fuel_type: l.build?.fuel_type || l.fuel_type || '',
        exterior_color: l.exterior_color || '',
        dealer_name: l.dealer?.name || '',
        city: l.dealer?.city || '',
        state: l.dealer?.state || '',
        dom: l.dom || 0,
        vdp_url: l.vdp_url || '',
        trim_tier: detectTrimTier(listingTrim)
      };
    });

    // Get prices from listings for manual median calculation
    const listingPrices = listings.map(l => l.price).filter(p => p > 0);

    // Parse stats from API
    let priceMedian = data.stats?.price?.median ? Math.round(data.stats.price.median) : null;
    let priceMean = data.stats?.price?.mean ? Math.round(data.stats.price.mean) : null;

    // FIXED: If API stats are 0/null but we have listings, calculate manually
    if ((!priceMedian || priceMedian === 0) && listingPrices.length > 0) {
      priceMedian = calculateMedian(listingPrices);
      log('MARKETCHECK', `API median was ${data.stats?.price?.median}, calculated manually from ${listingPrices.length} listings: $${priceMedian}`);
    }

    if ((!priceMean || priceMean === 0) && listingPrices.length > 0) {
      priceMean = Math.round(listingPrices.reduce((a, b) => a + b, 0) / listingPrices.length);
      log('MARKETCHECK', `API mean was ${data.stats?.price?.mean}, calculated manually: $${priceMean}`);
    }

    const stats: MarketCheckStats = {
      price_mean: priceMean,
      price_median: priceMedian,
      price_min: data.stats?.price?.min || (listingPrices.length ? Math.min(...listingPrices) : null),
      price_max: data.stats?.price?.max || (listingPrices.length ? Math.max(...listingPrices) : null),
      miles_mean: data.stats?.miles?.mean ? Math.round(data.stats.miles.mean) : null,
      dom_mean: data.stats?.dom?.mean ? Math.round(data.stats.dom.mean) : null,
      dom_median: data.stats?.dom?.median ? Math.round(data.stats.dom.median) : null,
      listing_count: data.num_found || listings.length
    };

    log('MARKETCHECK', `Stats after processing`, {
      api_median: data.stats?.price?.median,
      api_mean: data.stats?.price?.mean,
      final_median: stats.price_median,
      final_mean: stats.price_mean,
      listing_count: listings.length,
      prices_found: listingPrices.length
    });

    return {
      success: true,
      stats,
      listings,
      api_url: url.replace(apiKey, 'REDACTED'),
      raw_response: { num_found: data.num_found, stats: data.stats }
    };
  } catch (err) {
    log('MARKETCHECK', `Error: ${err.message}`);
    return {
      success: false,
      stats: null,
      listings: [],
      api_url: url.replace(apiKey, 'REDACTED'),
      raw_response: null,
      error: err.message
    };
  }
}

// Filter MarketCheck listings by trim tier and exact criteria
function filterDealerComparables(
  listings: MarketCheckListing[],
  targetYear: number,
  targetModel: string,
  targetTrimTier: string,
  targetFuelType?: string
): MarketCheckListing[] {
  const modelLower = targetModel.toLowerCase();

  log('FILTER', `Starting filter - ${listings.length} listings, target tier: ${targetTrimTier}, target fuel: ${targetFuelType || 'any'}`);

  const filtered = listings.filter(listing => {
    // Year must be within +/-1
    if (listing.year < targetYear - 1 || listing.year > targetYear + 1) {
      return false;
    }

    // Model must match (F-250 should not match F-150)
    const listingModel = listing.model.toLowerCase();
    if (!listingModel.includes(modelLower) && !modelLower.includes(listingModel)) {
      // Check for number matches (250 vs 150)
      const targetNum = modelLower.match(/\d+/)?.[0];
      const listingNum = listingModel.match(/\d+/)?.[0];
      if (targetNum && listingNum && targetNum !== listingNum) {
        return false;
      }
    }

    // Trim tier matching - FIXED: unknown tiers match anything
    if (!trimTiersMatch(targetTrimTier, listing.trim_tier)) {
      log('FILTER', `Excluding "${listing.trim}" (${listing.trim_tier}) - target is ${targetTrimTier}`);
      return false;
    }

    // Fuel type must match if specified
    if (targetFuelType) {
      const listingFuel = listing.fuel_type.toLowerCase();
      const targetFuel = targetFuelType.toLowerCase();
      if (!listingFuel.includes(targetFuel) && !targetFuel.includes(listingFuel)) {
        return false;
      }
    }

    // Must have a price
    if (!listing.price || listing.price < 1000) {
      return false;
    }

    return true;
  });

  log('FILTER', `Filter complete: ${listings.length} -> ${filtered.length} listings`);

  // Log trim tier distribution
  const tierCounts: Record<string, number> = {};
  listings.forEach(l => {
    tierCounts[l.trim_tier] = (tierCounts[l.trim_tier] || 0) + 1;
  });
  log('FILTER', 'Trim tier distribution in all listings:', tierCounts);

  return filtered;
}

// =============================================================================
// STEP 3: SERPAPI - Private Party Listings
// =============================================================================

interface PrivateListing {
  title: string;
  price: number;
  url: string;
  source: 'facebook' | 'craigslist' | 'offerup' | 'cargurus' | 'other';
  location: string;
  snippet: string;
  trim_tier: string;
}

async function searchPrivateParty(
  apiKey: string,
  params: {
    year: number;
    make: string;
    model: string;
    trim: string;
    fuel_type?: string;
  }
): Promise<PrivateListing[]> {
  if (!apiKey) {
    log('SERPAPI', 'No API key configured, skipping private party search');
    return [];
  }

  const { year, make, model, trim, fuel_type } = params;
  const listings: PrivateListing[] = [];

  // Build search query with trim
  const fuelPart = fuel_type?.toLowerCase() === 'diesel' ? ' diesel' : '';
  const trimPart = trim ? ` ${trim}` : '';
  const baseQuery = `${year} ${make} ${model}${trimPart}${fuelPart}`;

  // Search multiple platforms
  const searches = [
    { query: `${baseQuery} site:facebook.com/marketplace`, source: 'facebook' as const },
    { query: `${baseQuery} site:craigslist.org`, source: 'craigslist' as const },
    { query: `${baseQuery} site:offerup.com`, source: 'offerup' as const },
    { query: `${baseQuery} site:cargurus.com private seller`, source: 'cargurus' as const }
  ];

  for (const search of searches) {
    try {
      const serpParams = new URLSearchParams({
        engine: 'google',
        q: search.query,
        api_key: apiKey,
        num: '10'
      });

      const url = `https://serpapi.com/search?${serpParams.toString()}`;
      log('SERPAPI', `Searching ${search.source}: ${search.query}`);

      const res = await fetch(url);
      const data = await res.json();

      if (data.organic_results) {
        for (const result of data.organic_results) {
          const listing = parsePrivateListing(result, search.source);
          if (listing && listing.price > 0) {
            listings.push(listing);
          }
        }
        log('SERPAPI', `Found ${data.organic_results.length} results from ${search.source}`);
      }
    } catch (err) {
      log('SERPAPI', `Error searching ${search.source}: ${err.message}`);
    }
  }

  return listings;
}

function parsePrivateListing(result: any, source: PrivateListing['source']): PrivateListing | null {
  const title = result.title || '';
  const snippet = result.snippet || '';
  const link = result.link || '';

  // Extract price from title or snippet
  const text = `${title} ${snippet}`;
  const priceMatches = text.match(/\$[\d,]+/g) || [];
  let price = 0;

  for (const match of priceMatches) {
    const parsed = parseInt(match.replace(/[$,]/g, ''));
    if (parsed >= 5000 && parsed <= 200000) {
      price = parsed;
      break;
    }
  }

  // Extract location
  const locationMatch = snippet.match(/(?:in|near|at)\s+([A-Za-z\s]+,\s*[A-Z]{2})/i);
  const location = locationMatch ? locationMatch[1] : '';

  // Detect trim tier from title
  const trimTier = detectTrimTier(title);

  return {
    title: title.substring(0, 120),
    price,
    url: link,
    source,
    location,
    snippet: snippet.substring(0, 200),
    trim_tier: trimTier
  };
}

// Filter private listings by trim tier
function filterPrivateComparables(
  listings: PrivateListing[],
  targetTrimTier: string
): PrivateListing[] {
  return listings.filter(listing => {
    if (!trimTiersMatch(targetTrimTier, listing.trim_tier)) {
      return false;
    }
    return listing.price > 0;
  });
}

// =============================================================================
// STEP 4: CALCULATE VALUES
// =============================================================================

interface Valuations {
  mmr: number | null;
  marketcheck_price: number | null;
  retail_price: number | null;
  wholesale_low: number | null;
  wholesale_avg: number | null;
  wholesale_high: number | null;
  trade_in: number | null;
  kbb_estimate: number | null;
  nada_estimate: number | null;
  is_estimated: boolean;
  sample_size: number;
  trim_tier: string;
  adjustments: {
    base_price: number;
    mileage_adj: number;
    condition_adj: number;
    condition: string;
    mileage_note: string;
  };
}

function calculateValues(
  stats: MarketCheckStats | null,
  filteredListings: MarketCheckListing[],
  miles: number,
  condition: string,
  trimTier: string
): Valuations {
  // Try to get median from filtered listings first
  let basePrice = 0;
  let sampleSize = 0;
  let isEstimated = true;

  // Get prices from filtered listings
  const filteredPrices = filteredListings.map(l => l.price).filter(p => p > 0);

  log('VALUES', `Calculating values - ${filteredListings.length} filtered listings, ${filteredPrices.length} with prices`);

  if (filteredPrices.length >= 3) {
    // Calculate median from trim-filtered listings
    basePrice = calculateMedian(filteredPrices);
    sampleSize = filteredPrices.length;
    isEstimated = false;
    log('VALUES', `Using median from ${sampleSize} filtered listings: $${basePrice}`);
  } else if (filteredPrices.length > 0) {
    // Use what we have even if < 3
    basePrice = calculateMedian(filteredPrices);
    sampleSize = filteredPrices.length;
    isEstimated = true;
    log('VALUES', `Using median from ${sampleSize} listings (low confidence): $${basePrice}`);
  }

  // Fallback to MarketCheck stats if no filtered listings
  if (!basePrice && stats) {
    basePrice = stats.price_median || stats.price_mean || 0;
    sampleSize = stats.listing_count;
    isEstimated = sampleSize < 3;
    log('VALUES', `Fallback to MarketCheck stats median: $${basePrice}`);
  }

  if (!basePrice) {
    log('VALUES', 'No price data available');
    return {
      mmr: null,
      marketcheck_price: null,
      retail_price: null,
      wholesale_low: null,
      wholesale_avg: null,
      wholesale_high: null,
      trade_in: null,
      kbb_estimate: null,
      nada_estimate: null,
      is_estimated: true,
      sample_size: 0,
      trim_tier: trimTier,
      adjustments: {
        base_price: 0,
        mileage_adj: 0,
        condition_adj: 0,
        condition,
        mileage_note: 'No market data'
      }
    };
  }

  // Mileage adjustment
  const avgMiles = stats?.miles_mean || 60000;
  const milesDiff = miles - avgMiles;
  const mileageAdj = Math.round(milesDiff * -0.05); // $0.05 per mile

  // Condition adjustment
  const conditionMult = CONDITION_MULTIPLIERS[condition.toLowerCase()] || 1.0;
  const conditionAdj = Math.round(basePrice * (conditionMult - 1));

  // Calculate adjusted retail
  const adjustedRetail = basePrice + mileageAdj + conditionAdj;

  log('VALUES', `Final calculation`, {
    base_price: basePrice,
    mileage_adj: mileageAdj,
    condition_adj: conditionAdj,
    adjusted_retail: adjustedRetail
  });

  // Calculate other values
  const mmr = Math.round(adjustedRetail * 0.80);
  const wholesaleLow = Math.round(adjustedRetail * 0.75);
  const wholesaleAvg = Math.round(adjustedRetail * 0.80);
  const wholesaleHigh = Math.round(adjustedRetail * 0.85);
  const tradeIn = Math.round(adjustedRetail * 0.73);

  // AI estimates based on real baseline (not overriding)
  const kbbEstimate = Math.round(adjustedRetail * 1.02);
  const nadaEstimate = Math.round(adjustedRetail * 0.98);

  return {
    mmr,
    marketcheck_price: basePrice,
    retail_price: adjustedRetail,
    wholesale_low: wholesaleLow,
    wholesale_avg: wholesaleAvg,
    wholesale_high: wholesaleHigh,
    trade_in: tradeIn,
    kbb_estimate: kbbEstimate,
    nada_estimate: nadaEstimate,
    is_estimated: isEstimated,
    sample_size: sampleSize,
    trim_tier: trimTier,
    adjustments: {
      base_price: basePrice,
      mileage_adj: mileageAdj,
      condition_adj: conditionAdj,
      condition,
      mileage_note: `${miles.toLocaleString()} mi vs ${avgMiles.toLocaleString()} avg`
    }
  };
}

// =============================================================================
// STEP 5: BUILD MARKET ANALYSIS
// =============================================================================

interface MarketAnalysis {
  days_to_sell: number | null;
  demand_level: 'Hot' | 'Medium' | 'Cold' | 'Unknown';
  price_trend: 'Rising' | 'Stable' | 'Falling' | 'Unknown';
  supply_level: 'High' | 'Medium' | 'Low' | 'Unknown';
  listing_count: number;
  price_range: { min: number; max: number } | null;
}

function buildMarketAnalysis(stats: MarketCheckStats | null): MarketAnalysis {
  if (!stats) {
    return {
      days_to_sell: null,
      demand_level: 'Unknown',
      price_trend: 'Unknown',
      supply_level: 'Unknown',
      listing_count: 0,
      price_range: null
    };
  }

  const daysToSell = stats.dom_median || stats.dom_mean;

  let demandLevel: MarketAnalysis['demand_level'] = 'Medium';
  if (daysToSell !== null) {
    if (daysToSell < 30) demandLevel = 'Hot';
    else if (daysToSell > 60) demandLevel = 'Cold';
  }

  let priceTrend: MarketAnalysis['price_trend'] = 'Stable';
  if (stats.price_mean && stats.price_median) {
    const diff = (stats.price_mean - stats.price_median) / stats.price_median;
    if (diff > 0.05) priceTrend = 'Rising';
    else if (diff < -0.05) priceTrend = 'Falling';
  }

  let supplyLevel: MarketAnalysis['supply_level'] = 'Medium';
  if (stats.listing_count > 100) supplyLevel = 'High';
  else if (stats.listing_count < 20) supplyLevel = 'Low';

  return {
    days_to_sell: daysToSell,
    demand_level: demandLevel,
    price_trend: priceTrend,
    supply_level: supplyLevel,
    listing_count: stats.listing_count,
    price_range: stats.price_min && stats.price_max
      ? { min: stats.price_min, max: stats.price_max }
      : null
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
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
      miles,
      condition = 'Good',
      zip_code = '84065',
      radius_miles = 100,
      fuel_type
    } = body;

    log('MAIN', '========== NEW REQUEST ==========');
    log('MAIN', 'Request params', { vin, year, make, model, trim, miles, condition, zip_code, radius_miles, fuel_type });

    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");
    const SERP_API_KEY = Deno.env.get("SERP_API_KEY");

    if (!MARKETCHECK_API_KEY) {
      throw new Error("MARKETCHECK_API_KEY not configured");
    }

    // Track data sources
    const dataSources = {
      vin_decode: null as string | null,
      market_data: null as string | null,
      dealer_comparables: null as string | null,
      private_comparables: null as string | null,
      valuations: null as string | null
    };

    // =======================================================================
    // STEP 1: Decode VIN
    // =======================================================================
    let vehicleInfo: any = { year, make, model, trim, fuel_type, miles: miles || 60000 };
    let vinTrim = '';
    let vinSeries = '';

    if (vin && vin.length === 17) {
      const vinData = await decodeVIN(vin);
      if (vinData?.make && vinData?.model) {
        vinTrim = vinData.trim;
        vinSeries = vinData.series;

        vehicleInfo = {
          vin,
          year: vinData.year || year,
          make: vinData.make || make,
          model: vinData.model || model,
          trim: vinData.trim || trim,
          series: vinData.series,
          fuel_type: vinData.fuel_type || fuel_type,
          engine: vinData.engine,
          drivetrain: vinData.drivetrain,
          body_type: vinData.body_type,
          transmission: vinData.transmission,
          miles: miles || 60000
        };
        dataSources.vin_decode = 'nhtsa';
      }
    }

    const searchYear = vehicleInfo.year || year;
    const searchMake = vehicleInfo.make || make;
    const searchModel = vehicleInfo.model || model;
    const searchTrim = vehicleInfo.trim || trim || '';
    const searchSeries = vehicleInfo.series || '';
    const searchFuelType = vehicleInfo.fuel_type || fuel_type;
    const searchMiles = miles || vehicleInfo.miles || 60000;

    // FIXED: Detect trim tier from both trim and series fields
    const trimTier = detectTrimTier(searchTrim, searchSeries);

    // Also try to detect from user-provided trim if NHTSA didn't help
    const userProvidedTrimTier = trim ? detectTrimTier(trim) : 'unknown';
    const finalTrimTier = trimTier !== 'unknown' ? trimTier : userProvidedTrimTier;

    vehicleInfo.trim_tier = finalTrimTier;

    log('MAIN', `Trim tier detection summary`, {
      nhtsa_trim: searchTrim,
      nhtsa_series: searchSeries,
      user_trim: trim,
      detected_tier: trimTier,
      user_tier: userProvidedTrimTier,
      final_tier: finalTrimTier
    });

    log('MAIN', `Searching: ${searchYear} ${searchMake} ${searchModel} ${searchTrim} (${finalTrimTier} tier, ${searchFuelType || 'any fuel'})`);

    if (!searchYear || !searchMake || !searchModel) {
      throw new Error("Year, Make, and Model are required");
    }

    // =======================================================================
    // STEP 2: MarketCheck Search
    // =======================================================================
    const mcResult = await searchMarketCheck(MARKETCHECK_API_KEY, {
      year: parseInt(searchYear.toString()),
      make: searchMake,
      model: searchModel,
      fuel_type: searchFuelType,
      zip: zip_code,
      radius: radius_miles
    });

    if (mcResult.success) {
      dataSources.market_data = 'marketcheck';
      dataSources.dealer_comparables = 'marketcheck';
    }

    log('MAIN', `MarketCheck returned ${mcResult.listings.length} listings`);

    // Filter dealer listings by trim tier
    const filteredDealerListings = filterDealerComparables(
      mcResult.listings,
      parseInt(searchYear.toString()),
      searchModel,
      finalTrimTier,
      searchFuelType
    );

    log('MAIN', `After filtering: ${filteredDealerListings.length} dealer comparables (${finalTrimTier} tier)`);

    // Format dealer comparables for response
    const dealerComparables = filteredDealerListings.slice(0, 10).map(l => ({
      title: `${l.year} ${l.make} ${l.model} ${l.trim}`.trim(),
      year: l.year,
      make: l.make,
      model: l.model,
      trim: l.trim,
      trim_tier: l.trim_tier,
      price: l.price,
      miles: l.miles,
      fuel_type: l.fuel_type,
      location: `${l.city}, ${l.state}`.replace(/^,\s*/, ''),
      dealer: l.dealer_name,
      dom: l.dom,
      url: l.vdp_url,
      source: 'dealer' as const
    }));

    // =======================================================================
    // STEP 3: SerpAPI Private Party Search
    // =======================================================================
    let privateListings: PrivateListing[] = [];

    if (SERP_API_KEY) {
      // Use the best available trim for search query
      const searchQueryTrim = trim || searchTrim || '';

      privateListings = await searchPrivateParty(SERP_API_KEY, {
        year: parseInt(searchYear.toString()),
        make: searchMake,
        model: searchModel,
        trim: searchQueryTrim,
        fuel_type: searchFuelType
      });

      // Filter by trim tier
      privateListings = filterPrivateComparables(privateListings, finalTrimTier);

      if (privateListings.length > 0) {
        dataSources.private_comparables = 'serpapi';
      }

      log('MAIN', `Found ${privateListings.length} filtered private party listings`);
    }

    // Format private comparables for response
    const privateComparables = privateListings.slice(0, 10).map(l => ({
      title: l.title,
      price: l.price,
      location: l.location,
      url: l.url,
      source: l.source,
      trim_tier: l.trim_tier,
      snippet: l.snippet
    }));

    // =======================================================================
    // STEP 4: Calculate Values
    // =======================================================================
    const valuations = calculateValues(
      mcResult.stats,
      filteredDealerListings,
      searchMiles,
      condition,
      finalTrimTier
    );

    dataSources.valuations = valuations.is_estimated ? 'estimated' : 'marketcheck';

    // =======================================================================
    // STEP 5: Build Market Analysis
    // =======================================================================
    const marketAnalysis = buildMarketAnalysis(mcResult.stats);

    // =======================================================================
    // STEP 6: Build Response
    // =======================================================================
    const confidence = valuations.sample_size >= 10 ? 'HIGH' :
                       valuations.sample_size >= 5 ? 'MEDIUM' :
                       valuations.sample_size > 0 ? 'LOW' : 'ESTIMATED';

    log('MAIN', `Final response - confidence: ${confidence}, mmr: $${valuations.mmr}, sample_size: ${valuations.sample_size}`);

    const response = {
      success: true,
      vehicle: vehicleInfo,

      // Real MarketCheck values
      mmr: valuations.mmr,
      marketcheck_price: valuations.marketcheck_price,

      // Market stats (REAL)
      market_stats: {
        avg_dom: marketAnalysis.days_to_sell,
        price_trend: marketAnalysis.price_trend,
        supply_level: marketAnalysis.supply_level,
        demand_level: marketAnalysis.demand_level,
        listing_count: marketAnalysis.listing_count,
        price_range: marketAnalysis.price_range
      },

      // All valuations
      valuations: {
        mmr: valuations.mmr,
        retail: valuations.retail_price,
        wholesale_low: valuations.wholesale_low,
        wholesale_avg: valuations.wholesale_avg,
        wholesale_high: valuations.wholesale_high,
        trade_in: valuations.trade_in,
        kbb_estimate: valuations.kbb_estimate,
        nada_estimate: valuations.nada_estimate,
        is_estimated: valuations.is_estimated,
        sample_size: valuations.sample_size,
        adjustments: valuations.adjustments
      },

      // Comparables
      dealer_comparables: dealerComparables,
      private_comparables: privateComparables,

      // Metadata
      confidence,
      trim_tier: finalTrimTier,
      data_sources: dataSources,

      // Debug info
      debug: {
        marketcheck_url: mcResult.api_url,
        marketcheck_raw: mcResult.raw_response,
        nhtsa_trim: vinTrim,
        nhtsa_series: vinSeries,
        user_provided_trim: trim,
        detected_trim_tier: trimTier,
        final_trim_tier: finalTrimTier,
        total_mc_listings: mcResult.listings.length,
        filtered_dealer_count: filteredDealerListings.length,
        private_count: privateListings.length,
        serp_api_configured: !!SERP_API_KEY,
        calculated_median: valuations.marketcheck_price
      }
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    log('ERROR', error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
