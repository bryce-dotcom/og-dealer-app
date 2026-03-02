import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Model name variations to try
const MODEL_VARIATIONS: Record<string, string[]> = {
  'F-150': ['F-150', 'F150', 'F 150'],
  'F-250': ['F-250', 'F250', 'F 250', 'Super Duty'],
  'F-350': ['F-350', 'F350', 'F 350', 'Super Duty'],
  'F-450': ['F-450', 'F450', 'F 450', 'Super Duty'],
  'Silverado 1500': ['Silverado 1500', 'Silverado', '1500'],
  'Silverado 2500': ['Silverado 2500', 'Silverado 2500HD', 'Silverado HD', '2500'],
  'Silverado 3500': ['Silverado 3500', 'Silverado 3500HD', 'Silverado HD', '3500'],
  'Sierra 1500': ['Sierra 1500', 'Sierra', '1500'],
  'Sierra 2500': ['Sierra 2500', 'Sierra 2500HD', 'Sierra HD', '2500'],
  'Sierra 3500': ['Sierra 3500', 'Sierra 3500HD', 'Sierra HD', '3500'],
  'Grand Cherokee': ['Grand Cherokee', 'Grand-Cherokee', 'GrandCherokee'],
  'CR-V': ['CR-V', 'CRV', 'CR V'],
  'HR-V': ['HR-V', 'HRV', 'HR V'],
  'RAV4': ['RAV4', 'RAV-4', 'RAV 4'],
  '4Runner': ['4Runner', '4-Runner', '4 Runner'],
};

// Zip code to city mapping for common Utah zips
const ZIP_TO_CITY: Record<string, { city: string; state: string }> = {
  '84065': { city: 'Riverton', state: 'Utah' },
  '84095': { city: 'South Jordan', state: 'Utah' },
  '84121': { city: 'Salt Lake City', state: 'Utah' },
  '84101': { city: 'Salt Lake City', state: 'Utah' },
  '84102': { city: 'Salt Lake City', state: 'Utah' },
  '84103': { city: 'Salt Lake City', state: 'Utah' },
  '84104': { city: 'Salt Lake City', state: 'Utah' },
  '84105': { city: 'Salt Lake City', state: 'Utah' },
  '84106': { city: 'Salt Lake City', state: 'Utah' },
  '84107': { city: 'Murray', state: 'Utah' },
  '84108': { city: 'Salt Lake City', state: 'Utah' },
  '84109': { city: 'Salt Lake City', state: 'Utah' },
  '84111': { city: 'Salt Lake City', state: 'Utah' },
  '84115': { city: 'Salt Lake City', state: 'Utah' },
  '84116': { city: 'Salt Lake City', state: 'Utah' },
  '84117': { city: 'Holladay', state: 'Utah' },
  '84118': { city: 'Taylorsville', state: 'Utah' },
  '84119': { city: 'West Valley City', state: 'Utah' },
  '84120': { city: 'West Valley City', state: 'Utah' },
  '84123': { city: 'Taylorsville', state: 'Utah' },
  '84124': { city: 'Holladay', state: 'Utah' },
  '84128': { city: 'West Valley City', state: 'Utah' },
  '84129': { city: 'Taylorsville', state: 'Utah' },
  '84047': { city: 'Midvale', state: 'Utah' },
  '84070': { city: 'Sandy', state: 'Utah' },
  '84092': { city: 'Sandy', state: 'Utah' },
  '84093': { city: 'Sandy', state: 'Utah' },
  '84094': { city: 'Sandy', state: 'Utah' },
  '84020': { city: 'Draper', state: 'Utah' },
  '84043': { city: 'Lehi', state: 'Utah' },
  '84003': { city: 'American Fork', state: 'Utah' },
  '84057': { city: 'Orem', state: 'Utah' },
  '84058': { city: 'Orem', state: 'Utah' },
  '84601': { city: 'Provo', state: 'Utah' },
  '84602': { city: 'Provo', state: 'Utah' },
  '84604': { city: 'Provo', state: 'Utah' },
  '84660': { city: 'Spanish Fork', state: 'Utah' },
  '84401': { city: 'Ogden', state: 'Utah' },
  '84403': { city: 'Ogden', state: 'Utah' },
  '84404': { city: 'Ogden', state: 'Utah' },
  '84414': { city: 'Ogden', state: 'Utah' },
  '84301': { city: 'Logan', state: 'Utah' },
  '84321': { city: 'Logan', state: 'Utah' },
  '84341': { city: 'Logan', state: 'Utah' },
  '84770': { city: 'St. George', state: 'Utah' },
  '84790': { city: 'St. George', state: 'Utah' },
};

// Get city info from zip code
function getCityFromZip(zip: string): { city: string; state: string; location: string } {
  const info = ZIP_TO_CITY[zip];
  if (info) {
    return { ...info, location: `${info.city}, ${info.state}, United States` };
  }
  // Default to Salt Lake City area for unknown Utah zips
  if (zip.startsWith('84')) {
    return { city: 'Salt Lake City', state: 'Utah', location: 'Salt Lake City, Utah, United States' };
  }
  return { city: 'Salt Lake City', state: 'Utah', location: 'Utah, United States' };
}

// Get model variations to try
function getModelVariations(model: string): string[] {
  const variations = MODEL_VARIATIONS[model];
  if (variations) return variations;

  // Generate common variations
  const result = [model];
  if (model.includes('-')) {
    result.push(model.replace(/-/g, ''));
    result.push(model.replace(/-/g, ' '));
  }
  if (model.includes(' ')) {
    result.push(model.replace(/ /g, '-'));
    result.push(model.replace(/ /g, ''));
  }
  return result;
}

// Parse vehicle listing details from title/snippet
function parseVehicleListing(title: string, snippet: string = '', priceText: string = ''): {
  year: number | null;
  miles: number | null;
  price: number | null;
  cleanTitle: string;
} {
  const combined = `${title} ${snippet} ${priceText}`;

  // Extract year (1980-2029)
  const yearMatch = combined.match(/\b(19[89]\d|20[0-2]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;

  // Extract miles - handle various formats: "120k miles", "120,000 mi", "120000 miles", "120K"
  let miles: number | null = null;
  const milesPatterns = [
    /(\d{1,3})[,.]?(\d{3})\s*(mi|miles|mile)/i,  // 120,000 miles
    /(\d{2,3})k\s*(mi|miles|mile)?/i,             // 120k miles or just 120k
    /(\d{1,3})[,.]?(\d{3})\s*(?:odometer|odo)/i,  // 120,000 odometer
    /mileage[:\s]*(\d{1,3})[,.]?(\d{3})/i,        // mileage: 120,000
  ];

  for (const pattern of milesPatterns) {
    const match = combined.match(pattern);
    if (match) {
      if (match[2] && /^\d{3}$/.test(match[2])) {
        // Format: 120,000 or 120.000
        miles = parseInt(match[1] + match[2]);
      } else if (/k/i.test(combined.substring(match.index || 0, (match.index || 0) + match[0].length + 5))) {
        // Format: 120k
        miles = parseInt(match[1]) * 1000;
      } else if (match[1] && match[2]) {
        miles = parseInt(match[1] + match[2]);
      } else {
        miles = parseInt(match[1]) * 1000; // Assume k format
      }
      break;
    }
  }

  // Extract price - handle various formats
  let price: number | null = null;
  const pricePatterns = [
    /\$\s*([\d,]+)/,                              // $25,000
    /(?:price|asking)[:\s]*\$?([\d,]+)/i,         // price: 25000
    /\b([\d,]{4,6})\s*(?:obo|firm|cash|or best)/i, // 25000 obo
  ];

  for (const pattern of pricePatterns) {
    const match = combined.match(pattern);
    if (match) {
      const parsed = parseInt(match[1].replace(/,/g, ''));
      // Validate price is reasonable (1000 - 500000)
      if (parsed >= 1000 && parsed <= 500000) {
        price = parsed;
        break;
      }
    }
  }

  // Clean title - remove price and miles info
  let cleanTitle = title
    .replace(/\$[\d,]+/g, '')
    .replace(/\d{1,3}[,.]?\d{3}\s*(mi|miles|k\s*mi)/gi, '')
    .replace(/\d{2,3}k\s*(mi|miles)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { year, miles, price, cleanTitle };
}

// Calculate deal score for dealer listings
function calculateDealScore(askingPrice: number, marketValue: number): { score: string; savings: number; percentage: number } {
  const difference = marketValue - askingPrice;
  const percentage = (difference / marketValue) * 100;

  let score: string;
  if (percentage >= 10) {
    score = 'GREAT DEAL';
  } else if (percentage >= 5) {
    score = 'GOOD DEAL';
  } else if (percentage >= -5) {
    score = 'FAIR PRICE';
  } else if (percentage >= -10) {
    score = 'OVERPRICED';
  } else {
    score = 'BAD DEAL';
  }

  return { score, savings: Math.round(difference), percentage: Math.round(percentage * 10) / 10 };
}

// Calculate deal score for private party listings (different thresholds)
// Private party should be 10-20% below dealer prices
function calculatePrivateDealScore(askingPrice: number, dealerMedianPrice: number): { score: string; savings: number; percentage: number } {
  const difference = dealerMedianPrice - askingPrice;
  const percentage = (difference / dealerMedianPrice) * 100;

  let score: string;
  if (percentage >= 20) {
    score = 'GREAT DEAL';  // 20%+ below dealer = great for private
  } else if (percentage >= 10) {
    score = 'GOOD DEAL';   // 10-20% below dealer = good for private
  } else if (percentage >= 0) {
    score = 'FAIR PRICE';  // At or slightly below dealer = fair (could negotiate)
  } else {
    score = 'OVERPRICED';  // Above dealer median = why buy private?
  }

  return { score, savings: Math.round(difference), percentage: Math.round(percentage * 10) / 10 };
}

// Deal score priority for sorting
function getDealScorePriority(score: string): number {
  const priorities: Record<string, number> = {
    'GREAT DEAL': 1,
    'GOOD DEAL': 2,
    'FAIR PRICE': 3,
    'OVERPRICED': 4,
    'BAD DEAL': 5,
  };
  return priorities[score] || 99;
}

// Filter vehicles by specific criteria (engine type, drivetrain, etc.)
// These aren't in MarketCheck API filters, so we do text matching on trim/model
function matchesSpecificFilters(vehicle: any, filters: {
  engine_type?: string;
  drivetrain?: string;
  transmission?: string;
  body_type?: string;
  cab_type?: string;
  bed_length?: string;
}): boolean {
  const searchText = `${vehicle.model || ''} ${vehicle.trim || ''}`.toLowerCase();

  // Engine Type filtering
  if (filters.engine_type) {
    const engineType = filters.engine_type.toLowerCase();
    if (engineType === 'diesel') {
      if (!searchText.includes('diesel') && !searchText.includes('turbodiesel') && !searchText.includes('powerstroke') && !searchText.includes('duramax') && !searchText.includes('cummins')) {
        return false;
      }
    } else if (engineType === 'gas') {
      // Gas is default, but exclude if it explicitly says diesel/electric/hybrid
      if (searchText.includes('diesel') || searchText.includes('electric') || searchText.includes('hybrid') || searchText.includes('plug-in') || searchText.includes('ev') || searchText.includes('phev')) {
        return false;
      }
    } else if (engineType === 'electric') {
      if (!searchText.includes('electric') && !searchText.includes(' ev ') && !searchText.includes('tesla') && !searchText.includes('e-tron')) {
        return false;
      }
    } else if (engineType === 'hybrid') {
      if (!searchText.includes('hybrid') && !searchText.includes('phev') && !searchText.includes('plug-in')) {
        return false;
      }
    }
  }

  // Drivetrain filtering
  if (filters.drivetrain) {
    const drivetrain = filters.drivetrain.toUpperCase();
    if (drivetrain === '4WD') {
      if (!searchText.includes('4wd') && !searchText.includes('4x4') && !searchText.includes('four wheel') && !searchText.includes('fourwheel')) {
        return false;
      }
    } else if (drivetrain === 'AWD') {
      if (!searchText.includes('awd') && !searchText.includes('all wheel') && !searchText.includes('allwheel') && !searchText.includes('quattro') && !searchText.includes('xdrive')) {
        return false;
      }
    } else if (drivetrain === '2WD') {
      // 2WD is tricky - it's often the default and NOT mentioned
      // Only exclude if it explicitly says 4WD/AWD
      if (searchText.includes('4wd') || searchText.includes('4x4') || searchText.includes('awd') || searchText.includes('all wheel') || searchText.includes('quattro') || searchText.includes('xdrive')) {
        return false;
      }
    }
  }

  // Transmission filtering
  if (filters.transmission) {
    const trans = filters.transmission.toLowerCase();
    if (trans === 'manual') {
      if (!searchText.includes('manual') && !searchText.includes('stick') && !searchText.includes('mt') && !searchText.includes('6-speed manual')) {
        return false;
      }
    } else if (trans === 'automatic') {
      // Automatic is default, exclude manual/CVT
      if (searchText.includes('manual') || searchText.includes('stick') || searchText.includes('cvt')) {
        return false;
      }
    } else if (trans === 'CVT') {
      if (!searchText.includes('cvt')) {
        return false;
      }
    }
  }

  // Body Type filtering
  if (filters.body_type) {
    const bodyType = filters.body_type.toLowerCase();
    if (bodyType === 'truck') {
      if (!searchText.includes('pickup') && !searchText.includes('truck') && !vehicle.make?.toLowerCase().includes('ram') && !searchText.includes('f-150') && !searchText.includes('f-250') && !searchText.includes('f-350') && !searchText.includes('silverado') && !searchText.includes('sierra') && !searchText.includes('tundra') && !searchText.includes('tacoma') && !searchText.includes('ranger') && !searchText.includes('colorado') && !searchText.includes('frontier')) {
        return false;
      }
    } else if (bodyType === 'suv') {
      if (!searchText.includes('suv') && !searchText.includes('sport utility') && !searchText.includes('explorer') && !searchText.includes('tahoe') && !searchText.includes('suburban') && !searchText.includes('expedition') && !searchText.includes('yukon') && !searchText.includes('durango') && !searchText.includes('highlander') && !searchText.includes('pilot')) {
        return false;
      }
    }
    // Other body types can be added as needed
  }

  // Cab Type filtering (for trucks)
  if (filters.cab_type) {
    const cabType = filters.cab_type.toLowerCase();
    if (cabType === 'crew cab') {
      if (!searchText.includes('crew') && !searchText.includes('crewmax')) {
        return false;
      }
    } else if (cabType === 'extended cab') {
      if (!searchText.includes('extended') && !searchText.includes('supercab') && !searchText.includes('double cab')) {
        return false;
      }
    } else if (cabType === 'regular cab') {
      if (!searchText.includes('regular') && searchText.includes('crew') && searchText.includes('extended')) {
        return false;
      }
    } else if (cabType === 'mega cab') {
      if (!searchText.includes('mega')) {
        return false;
      }
    }
  }

  // Bed Length filtering (for trucks)
  if (filters.bed_length) {
    const bedLength = filters.bed_length.toLowerCase();
    if (bedLength === 'short') {
      if (!searchText.includes('short') && !searchText.includes('5.5') && !searchText.includes('5.7') && !searchText.includes("5'")) {
        // Allow if no bed info specified (assume varies)
        if (searchText.includes('long') || searchText.includes('8') || searchText.includes("8'")) {
          return false;
        }
      }
    } else if (bedLength === 'long') {
      if (!searchText.includes('long') && !searchText.includes('8') && !searchText.includes("8'")) {
        return false;
      }
    }
    // Standard bed is tricky as it's often not specified
  }

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    const {
      year_min,
      year_max,
      make,
      model,
      trim,
      engine_type,
      drivetrain,
      transmission,
      body_type,
      cab_type,
      bed_length,
      max_price,
      max_miles,
      color,
      zip_code = '84065',
      radius_miles = 250
    } = await req.json();

    log(`=== FIND VEHICLES REQUEST ===`);
    log(`Input: ${JSON.stringify({ year_min, year_max, make, model, trim, engine_type, drivetrain, transmission, body_type, cab_type, bed_length, max_price, max_miles, color, zip_code, radius_miles })}`);

    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");
    const SERPAPI_API_KEY = Deno.env.get("SERP_API_KEY"); // Note: secret is SERP_API_KEY
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    log(`API Keys: MC=${!!MARKETCHECK_API_KEY}, SERP=${!!SERPAPI_API_KEY}, ANTHROPIC=${!!ANTHROPIC_API_KEY}`);

    if (!make) {
      throw new Error("Make is required");
    }

    const searchMake = make.toLowerCase();
    const searchModel = model || '';
    const yearRange = year_min && year_max ? `${year_min}-${year_max}` : year_min || year_max || '';
    const cityInfo = getCityFromZip(zip_code);

    let dealerListings: any[] = [];
    let privateListings: any[] = [];
    let marketSummary: any = null;
    const priceCache: Map<string, number> = new Map();
    const seenUrls: Set<string> = new Set(); // For deduplication

    // ===== PART 1: MARKETCHECK DEALER LISTINGS =====
    if (MARKETCHECK_API_KEY && searchModel) {
      log(`\n=== MARKETCHECK DEALER SEARCH ===`);

      const modelVariations = getModelVariations(searchModel);
      log(`Model variations to try: ${modelVariations.join(', ')}`);

      for (const modelVariant of modelVariations) {
        const params = new URLSearchParams({
          api_key: MARKETCHECK_API_KEY,
          make: searchMake,
          model: modelVariant,
          car_type: 'used',
          rows: '50',
          sort_by: 'price',
          sort_order: 'asc',
          stats: 'price,miles,dom', // Request stats for market summary
        });

        if (yearRange) {
          if (year_min && year_max) {
            params.set('year', `${year_min}-${year_max}`);
          } else if (year_min) {
            params.set('year', `${year_min}-${new Date().getFullYear() + 1}`);
          } else if (year_max) {
            params.set('year', `2000-${year_max}`);
          }
        }

        if (max_price) {
          params.set('price_range', `0-${max_price}`);
        }

        if (max_miles) {
          params.set('miles_range', `0-${max_miles}`);
        }

        if (zip_code) {
          params.set('zip', zip_code);
          // MarketCheck has 100 mile limit on some plans
          params.set('radius', String(Math.min(radius_miles, 100)));
        }

        if (trim) {
          params.set('trim', trim);
        }

        const mcUrl = `https://mc-api.marketcheck.com/v2/search/car/active?${params.toString()}`;
        log(`MarketCheck URL: ${mcUrl.replace(MARKETCHECK_API_KEY, 'KEY_HIDDEN')}`);

        try {
          const mcRes = await fetch(mcUrl, {
            headers: { 'Host': 'mc-api.marketcheck.com' }
          });

          log(`MarketCheck Response Status: ${mcRes.status}`);

          if (mcRes.ok) {
            const mcData = await mcRes.json();
            log(`MarketCheck num_found: ${mcData.num_found || 0}`);

            if (mcData.num_found > 0 && mcData.listings) {
              // Extract listings
              for (const listing of mcData.listings) {
                dealerListings.push({
                  id: listing.id,
                  vin: listing.vin,
                  year: listing.build?.year || listing.year,
                  make: listing.build?.make || listing.make,
                  model: listing.build?.model || listing.model,
                  trim: listing.build?.trim || listing.trim,
                  price: listing.price,
                  miles: listing.miles,
                  location: `${listing.dealer?.city || ''}, ${listing.dealer?.state || ''}`.trim().replace(/^,\s*|,\s*$/g, ''),
                  dealer_name: listing.dealer?.name,
                  url: listing.vdp_url,
                  days_listed: listing.dom,
                  exterior_color: listing.exterior_color,
                  seller_type: listing.seller_type || 'Dealer',
                  source: 'Dealer',
                  // Will add market_value, deal_score, savings in Part 2
                });
              }

              // Calculate market summary from stats
              log(`MarketCheck stats: ${JSON.stringify(mcData.stats || {}).slice(0, 300)}`);
              if (mcData.stats?.price) {
                marketSummary = {
                  avg_price: Math.round(mcData.stats.price.mean || 0),
                  median_price: Math.round(mcData.stats.price.median || 0),
                  price_range: {
                    low: mcData.stats.price.min || 0,
                    high: mcData.stats.price.max || 0,
                  },
                  total_available: mcData.num_found,
                  avg_days_on_market: mcData.stats.dom?.mean ? Math.round(mcData.stats.dom.mean) : null,
                };
                log(`Market summary: avg=${marketSummary.avg_price}, median=${marketSummary.median_price}`);
              }

              log(`Extracted ${dealerListings.length} dealer listings`);
              break; // Found results, stop trying variations
            }
          } else {
            const errorText = await mcRes.text();
            log(`MarketCheck Error: ${errorText}`);
          }
        } catch (mcError) {
          log(`MarketCheck Exception: ${mcError.message}`);
        }
      }
    }

    // ===== PART 2: MARKETCHECK PRICE PREDICTION (Deal Scoring) =====
    // Get MMR for both dealer AND private listings
    const allListings = [...dealerListings, ...privateListings];
    if (MARKETCHECK_API_KEY && allListings.length > 0) {
      log(`\n=== MARKETCHECK PRICE PREDICTIONS (for ${dealerListings.length} dealer + ${privateListings.length} private listings) ===`);

      // Group by year/make/model/trim to reduce API calls
      const uniqueVehicles = new Map<string, any>();
      for (const listing of allListings) {
        const key = `${listing.year}-${listing.make}-${listing.model}-${listing.trim || 'base'}-${Math.round((listing.miles || 60000) / 10000) * 10000}`;
        if (!uniqueVehicles.has(key)) {
          uniqueVehicles.set(key, listing);
        }
      }

      // Limit predictions to avoid rate limits - just get a few samples
      const samplesToPredict = Array.from(uniqueVehicles.entries()).slice(0, 5);
      log(`Fetching predictions for ${samplesToPredict.length} of ${uniqueVehicles.size} unique configs`);

      for (const [key, sample] of samplesToPredict) {
        if (priceCache.has(key)) continue;

        try {
          const predParams = new URLSearchParams({
            api_key: MARKETCHECK_API_KEY,
            car_type: 'used', // Required parameter
          });

          if (sample.vin) {
            predParams.set('vin', sample.vin);
            predParams.set('miles', String(sample.miles || 60000));
          } else {
            predParams.set('year', String(sample.year));
            predParams.set('make', sample.make.toLowerCase());
            predParams.set('model', sample.model);
            if (sample.trim) predParams.set('trim', sample.trim);
            predParams.set('miles', String(sample.miles || 60000));
          }

          const predUrl = `https://mc-api.marketcheck.com/v2/predict/car/price?${predParams.toString()}`;
          log(`Prediction URL: ${predUrl.replace(MARKETCHECK_API_KEY, 'KEY_HIDDEN')}`);

          const predRes = await fetch(predUrl);

          if (predRes.ok) {
            const predData = await predRes.json();
            const marketValue = predData.predicted_price || predData.price || predData.adjusted_price || predData.retail_price;
            if (marketValue) {
              priceCache.set(key, marketValue);
              log(`Cached value for ${key}: $${marketValue}`);
            }
          } else if (predRes.status === 429) {
            log(`Rate limited, stopping predictions`);
            break;
          }
        } catch (predError) {
          log(`Prediction error for ${key}: ${predError.message}`);
        }
      }

      // Apply MMR and deal scores to ALL listings (dealer + private)
      for (const listing of allListings) {
        const key = `${listing.year}-${listing.make}-${listing.model}-${listing.trim || 'base'}-${Math.round((listing.miles || 60000) / 10000) * 10000}`;
        let marketValue = priceCache.get(key);

        // Fallback to market summary median if no specific prediction
        if (!marketValue && marketSummary?.median_price) {
          marketValue = marketSummary.median_price;
        }

        if (marketValue && listing.price) {
          listing.mmr = marketValue;  // Add MMR field
          listing.market_value = marketValue;
          const { score, savings, percentage } = calculateDealScore(listing.price, marketValue);
          listing.deal_score = score;
          listing.savings = savings;
          listing.savings_percentage = percentage;
        } else {
          listing.mmr = null;  // Add MMR field even if null
          listing.market_value = null;
          listing.deal_score = 'UNKNOWN';
          listing.savings = 0;
          listing.savings_percentage = 0;
        }
      }

      // Sort by deal score, then by price
      dealerListings.sort((a, b) => {
        const scoreDiff = getDealScorePriority(a.deal_score) - getDealScorePriority(b.deal_score);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.price || 0) - (b.price || 0);
      });

      log(`Applied deal scores to ${dealerListings.length} listings`);
    }

    // ===== PART 3: SERPAPI PRIVATE PARTY LISTINGS =====
    // Note: Using Google Search for all sources since dedicated FB/Craigslist engines require premium SerpAPI plan
    if (SERPAPI_API_KEY) {
      log(`\n=== SERPAPI PRIVATE PARTY SEARCH ===`);
      log(`Location: ${cityInfo.location} (from zip ${zip_code})`);

      let fbCount = 0;
      let clCount = 0;
      let offerUpCount = 0;
      let carGurusCount = 0;

      const yearQuery = year_min && year_max ? `${year_min}-${year_max}` : (year_min ? `${year_min}` : (year_max ? `${year_max}` : ''));
      const vehicleQuery = `${yearQuery} ${make} ${model || ''}`.trim();

      // ----- GOOGLE SEARCH: Craigslist -----
      try {
        const clQuery = `${vehicleQuery} for sale site:craigslist.org`;
        const clParams = new URLSearchParams({
          api_key: SERPAPI_API_KEY,
          engine: 'google',
          q: clQuery,
          location: `${cityInfo.city}, ${cityInfo.state}`,
          num: '20',
        });

        const clUrl = `https://serpapi.com/search?${clParams.toString()}`;
        log(`Craigslist (Google) URL: ${clUrl.replace(SERPAPI_API_KEY, 'KEY_HIDDEN')}`);

        const clRes = await fetch(clUrl);
        log(`Craigslist Response Status: ${clRes.status}`);

        if (clRes.ok) {
          const clData = await clRes.json();
          const results = clData.organic_results || [];
          log(`Craigslist raw results: ${results.length}`);

          for (const item of results.slice(0, 20)) {
            const url = item.link || '';
            if (seenUrls.has(url)) continue;
            if (!url.includes('craigslist.org')) continue;
            seenUrls.add(url);

            const parsed = parseVehicleListing(item.title || '', item.snippet || '', '');

            // Filter by year range
            if (year_min && parsed.year && parsed.year < year_min) continue;
            if (year_max && parsed.year && parsed.year > year_max) continue;

            // Filter by price
            if (max_price && parsed.price && parsed.price > max_price) continue;
            if (parsed.price && (parsed.price < 1000 || parsed.price > 500000)) continue;

            privateListings.push({
              title: parsed.cleanTitle || item.title,
              year: parsed.year,
              make,
              model,
              price: parsed.price,
              miles: parsed.miles,
              location: item.displayed_link?.split('/')[0]?.replace('.craigslist.org', '') || cityInfo.city,
              url,
              source: 'Craigslist',
              thumbnail: null,
            });
            clCount++;
          }
        }
      } catch (clError) {
        log(`Craigslist Exception: ${clError.message}`);
      }

      log(`Craigslist added: ${clCount} listings`);

      // ----- GOOGLE SEARCH: Facebook Marketplace -----
      try {
        const fbQuery = `${vehicleQuery} for sale site:facebook.com/marketplace`;
        const fbParams = new URLSearchParams({
          api_key: SERPAPI_API_KEY,
          engine: 'google',
          q: fbQuery,
          location: `${cityInfo.city}, ${cityInfo.state}`,
          num: '20',
        });

        const fbUrl = `https://serpapi.com/search?${fbParams.toString()}`;
        log(`FB Marketplace (Google) URL: ${fbUrl.replace(SERPAPI_API_KEY, 'KEY_HIDDEN')}`);

        const fbRes = await fetch(fbUrl);
        log(`FB Marketplace Response Status: ${fbRes.status}`);

        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const results = fbData.organic_results || [];
          log(`FB Marketplace raw results: ${results.length}`);

          for (const item of results.slice(0, 20)) {
            const url = item.link || '';
            if (seenUrls.has(url)) continue;
            if (!url.includes('facebook.com')) continue;
            seenUrls.add(url);

            const parsed = parseVehicleListing(item.title || '', item.snippet || '', '');

            // Filter by year range
            if (year_min && parsed.year && parsed.year < year_min) continue;
            if (year_max && parsed.year && parsed.year > year_max) continue;

            // Filter by price
            if (max_price && parsed.price && parsed.price > max_price) continue;
            if (parsed.price && (parsed.price < 1000 || parsed.price > 500000)) continue;

            privateListings.push({
              title: parsed.cleanTitle || item.title,
              year: parsed.year,
              make,
              model,
              price: parsed.price,
              miles: parsed.miles,
              location: cityInfo.city,
              url,
              source: 'FB Marketplace',
              thumbnail: null,
            });
            fbCount++;
          }
        }
      } catch (fbError) {
        log(`FB Marketplace Exception: ${fbError.message}`);
      }

      log(`FB Marketplace added: ${fbCount} listings`);

      // ===== APIFY FACEBOOK MARKETPLACE (Better results) =====
      const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');

      if (APIFY_API_KEY) {
        log(`\n=== APIFY FACEBOOK MARKETPLACE ===`);

        const fbSearchUrl = new URL('https://www.facebook.com/marketplace/saltlakecity/search');
        fbSearchUrl.searchParams.set('query', (make + ' ' + (model || '')).trim());
        if (max_price) fbSearchUrl.searchParams.set('maxPrice', String(max_price));
        if (year_min) fbSearchUrl.searchParams.set('minYear', String(year_min));
        if (year_max) fbSearchUrl.searchParams.set('maxYear', String(year_max));
        if (max_miles) fbSearchUrl.searchParams.set('maxMileage', String(max_miles));

        log(`Apify FB URL: ${fbSearchUrl.toString()}`);

        try {
          const apifyRes = await fetch(
            'https://api.apify.com/v2/acts/datavoyantlab~facebook-marketplace-scraper/run-sync-get-dataset-items?token=' + APIFY_API_KEY,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                startUrls: [fbSearchUrl.toString()],
                maxItems: 50,
              }),
            }
          );

          log(`Apify status: ${apifyRes.status}`);

          if (apifyRes.ok) {
            const apifyData = await apifyRes.json();
            log(`Apify found: ${apifyData?.length || 0} listings`);
            let apifyCount = 0;

            for (const item of (apifyData || [])) {
              if (item.is_sold || item.is_pending) continue;

              const price = item.listing_price?.amount ? parseFloat(item.listing_price.amount) : null;

              // Parse miles from subtitle
              let miles: number | null = null;
              const milesText = item.custom_sub_titles_with_rendering_flags?.[0]?.subtitle || '';
              const milesMatch = milesText.match(/(\d+)K?\s*miles?/i);
              if (milesMatch) {
                miles = milesText.toLowerCase().includes('k') ? parseInt(milesMatch[1]) * 1000 : parseInt(milesMatch[1]);
              }

              // Parse year from title
              const yearMatch = (item.marketplace_listing_title || item.custom_title || '').match(/\b(19|20)\d{2}\b/);
              const year = yearMatch ? parseInt(yearMatch[0]) : null;

              const listingUrl = item.id ? 'https://www.facebook.com/marketplace/item/' + item.id : null;

              // Skip if URL already exists (dedup)
              if (listingUrl && seenUrls.has(listingUrl)) continue;
              if (listingUrl) seenUrls.add(listingUrl);

              // Filter by year range
              if (year_min && year && year < year_min) continue;
              if (year_max && year && year > year_max) continue;

              // Filter by price
              if (max_price && price && price > max_price) continue;
              if (price && (price < 1000 || price > 500000)) continue;

              privateListings.push({
                title: item.marketplace_listing_title || item.custom_title,
                year: year,
                make: make,
                model: model,
                price: price,
                miles: miles,
                location: item.location?.reverse_geocode ? (item.location.reverse_geocode.city + ', ' + item.location.reverse_geocode.state) : 'Utah',
                url: listingUrl,
                source: 'FB Marketplace',
                thumbnail: item.primary_listing_photo?.image?.uri,
              });
              apifyCount++;
            }
            log(`Apify FB Marketplace added: ${apifyCount} listings`);
            log(`Total FB listings after Apify: ${privateListings.filter(p => p.source === 'FB Marketplace').length}`);
          } else {
            const errText = await apifyRes.text();
            log(`Apify error response: ${errText.slice(0, 200)}`);
          }
        } catch (apifyError) {
          log(`Apify error: ${apifyError.message}`);
        }
      }

      // ----- GOOGLE SEARCH: OfferUp -----
      try {
        const ouQuery = `${vehicleQuery} for sale site:offerup.com`;
        const ouParams = new URLSearchParams({
          api_key: SERPAPI_API_KEY,
          engine: 'google',
          q: ouQuery,
          location: `${cityInfo.city}, ${cityInfo.state}`,
          num: '15',
        });

        const ouUrl = `https://serpapi.com/search?${ouParams.toString()}`;
        log(`OfferUp (Google) URL: ${ouUrl.replace(SERPAPI_API_KEY, 'KEY_HIDDEN')}`);

        const ouRes = await fetch(ouUrl);
        log(`OfferUp Response Status: ${ouRes.status}`);

        if (ouRes.ok) {
          const ouData = await ouRes.json();
          const results = ouData.organic_results || [];
          log(`OfferUp raw results: ${results.length}`);

          for (const item of results.slice(0, 15)) {
            const url = item.link || '';
            if (seenUrls.has(url)) continue;
            if (!url.includes('offerup.com')) continue;
            seenUrls.add(url);

            const parsed = parseVehicleListing(item.title || '', item.snippet || '', '');

            // Filter by year range
            if (year_min && parsed.year && parsed.year < year_min) continue;
            if (year_max && parsed.year && parsed.year > year_max) continue;

            // Filter by price
            if (max_price && parsed.price && parsed.price > max_price) continue;
            if (parsed.price && (parsed.price < 1000 || parsed.price > 500000)) continue;

            privateListings.push({
              title: parsed.cleanTitle || item.title,
              year: parsed.year,
              make,
              model,
              price: parsed.price,
              miles: parsed.miles,
              location: item.displayed_link?.split('/')[0] || cityInfo.city,
              url,
              source: 'OfferUp',
              thumbnail: null,
            });
            offerUpCount++;
          }
        }
      } catch (ouError) {
        log(`OfferUp Exception: ${ouError.message}`);
      }

      log(`OfferUp added: ${offerUpCount} listings`);

      // ----- GOOGLE SEARCH: CarGurus -----
      try {
        const cgQuery = `${vehicleQuery} for sale site:cargurus.com`;
        const cgParams = new URLSearchParams({
          api_key: SERPAPI_API_KEY,
          engine: 'google',
          q: cgQuery,
          location: `${cityInfo.city}, ${cityInfo.state}`,
          num: '15',
        });

        const cgUrl = `https://serpapi.com/search?${cgParams.toString()}`;
        log(`CarGurus (Google) URL: ${cgUrl.replace(SERPAPI_API_KEY, 'KEY_HIDDEN')}`);

        const cgRes = await fetch(cgUrl);
        log(`CarGurus Response Status: ${cgRes.status}`);

        if (cgRes.ok) {
          const cgData = await cgRes.json();
          const results = cgData.organic_results || [];
          log(`CarGurus raw results: ${results.length}`);

          for (const item of results.slice(0, 15)) {
            const url = item.link || '';
            if (seenUrls.has(url)) continue;
            if (!url.includes('cargurus.com')) continue;
            seenUrls.add(url);

            const parsed = parseVehicleListing(item.title || '', item.snippet || '', '');

            // Filter by year range
            if (year_min && parsed.year && parsed.year < year_min) continue;
            if (year_max && parsed.year && parsed.year > year_max) continue;

            // Filter by price
            if (max_price && parsed.price && parsed.price > max_price) continue;
            if (parsed.price && (parsed.price < 1000 || parsed.price > 500000)) continue;

            privateListings.push({
              title: parsed.cleanTitle || item.title,
              year: parsed.year,
              make,
              model,
              price: parsed.price,
              miles: parsed.miles,
              location: item.displayed_link?.split('/')[0] || cityInfo.city,
              url,
              source: 'CarGurus',
              thumbnail: null,
            });
            carGurusCount++;
          }
        }
      } catch (cgError) {
        log(`CarGurus Exception: ${cgError.message}`);
      }

      log(`CarGurus added: ${carGurusCount} listings`);

      // ----- DEAL SCORING FOR PRIVATE LISTINGS -----
      const dealerMedianPrice = marketSummary?.median_price || marketSummary?.avg_price;
      if (dealerMedianPrice) {
        log(`Scoring private listings against dealer median: $${dealerMedianPrice}`);
        for (const listing of privateListings) {
          if (listing.price) {
            const { score, savings, percentage } = calculatePrivateDealScore(listing.price, dealerMedianPrice);
            listing.estimated_deal_score = score;
            listing.estimated_savings = savings;
            listing.savings_percentage = percentage;
            listing.dealer_comparison = dealerMedianPrice;
          }
        }
      }

      // ----- SORT PRIVATE LISTINGS -----
      // Sort by deal score (best first), then by price ascending
      privateListings.sort((a, b) => {
        const scoreA = getDealScorePriority(a.estimated_deal_score || 'UNKNOWN');
        const scoreB = getDealScorePriority(b.estimated_deal_score || 'UNKNOWN');
        if (scoreA !== scoreB) return scoreA - scoreB;
        return (a.price || 999999) - (b.price || 999999);
      });

      log(`\n=== PRIVATE PARTY SUMMARY ===`);
      log(`Craigslist: ${clCount}`);
      log(`FB Marketplace: ${fbCount}`);
      log(`OfferUp: ${offerUpCount}`);
      log(`CarGurus: ${carGurusCount}`);
      log(`Total private listings (deduplicated): ${privateListings.length}`);
    }

    // ===== FALLBACK: Use Claude if no results =====
    if (dealerListings.length === 0 && privateListings.length === 0 && ANTHROPIC_API_KEY) {
      log(`\n=== ANTHROPIC FALLBACK ===`);

      try {
        const prompt = `I'm looking for a ${year_min || ''}${year_max ? '-' + year_max : ''} ${make} ${model || ''} with max price ${max_price ? '$' + max_price : 'any'} and max miles ${max_miles || 'any'}.

Provide a brief market summary with:
1. Typical price range for this vehicle
2. Key things to look for
3. Where to find good deals
4. Any known issues to watch for

Keep it concise and practical for a car buyer.`;

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (anthropicRes.ok) {
          const anthropicData = await anthropicRes.json();
          const aiResponse = anthropicData.content?.[0]?.text || '';
          log(`Got AI market summary`);

          // Return AI-generated guidance when no listings found
          return new Response(
            JSON.stringify({
              success: true,
              search_params: { make, model, year_range: yearRange, location: zip_code, radius: radius_miles },
              market_summary: {
                avg_price: null,
                median_price: null,
                price_range: null,
                total_available: 0,
                avg_days_on_market: null,
                ai_insights: aiResponse,
              },
              dealer_listings: [],
              private_listings: [],
              total_found: 0,
              message: 'No listings found in your area. Here\'s what we know about this vehicle:',
              ai_guidance: aiResponse,
              logs: logs,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (aiError) {
        log(`Anthropic Error: ${aiError.message}`);
      }
    }

    // ===== APPLY SPECIFIC FILTERS =====
    const filters = { engine_type, drivetrain, transmission, body_type, cab_type, bed_length };
    const hasSpecificFilters = engine_type || drivetrain || transmission || body_type || cab_type || bed_length;

    if (hasSpecificFilters) {
      log(`\n=== APPLYING SPECIFIC FILTERS ===`);
      log(`Filters: ${JSON.stringify(filters)}`);

      const originalDealerCount = dealerListings.length;
      const originalPrivateCount = privateListings.length;

      dealerListings = dealerListings.filter(v => matchesSpecificFilters(v, filters));
      privateListings = privateListings.filter(v => matchesSpecificFilters(v, filters));

      log(`Dealer listings: ${originalDealerCount} -> ${dealerListings.length}`);
      log(`Private listings: ${originalPrivateCount} -> ${privateListings.length}`);
    }

    // ===== FINAL RESPONSE =====
    const totalFound = dealerListings.length + privateListings.length;
    log(`\n=== FINAL RESULTS ===`);
    log(`Total dealer listings: ${dealerListings.length}`);
    log(`Total private listings: ${privateListings.length}`);
    log(`Total found: ${totalFound}`);

    return new Response(
      JSON.stringify({
        success: true,
        search_params: {
          make,
          model,
          year_range: yearRange,
          location: zip_code,
          radius: radius_miles,
          max_price,
          max_miles,
        },
        market_summary: marketSummary || {
          avg_price: null,
          median_price: null,
          price_range: null,
          total_available: totalFound,
          avg_days_on_market: null,
        },
        dealer_listings: dealerListings,
        private_listings: privateListings,
        total_found: totalFound,
        logs: logs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log(`FATAL ERROR: ${error.message}`);
    console.error("Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        logs: logs,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
