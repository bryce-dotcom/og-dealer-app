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

// Calculate deal score
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
      max_price,
      max_miles,
      color,
      zip_code = '84065',
      radius_miles = 250
    } = await req.json();

    log(`=== FIND VEHICLES REQUEST ===`);
    log(`Input: ${JSON.stringify({ year_min, year_max, make, model, trim, max_price, max_miles, color, zip_code, radius_miles })}`);

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

    let dealerListings: any[] = [];
    let privateListings: any[] = [];
    let marketSummary: any = null;
    const priceCache: Map<string, number> = new Map();

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
    if (MARKETCHECK_API_KEY && dealerListings.length > 0) {
      log(`\n=== MARKETCHECK PRICE PREDICTIONS ===`);

      // Group by year/make/model/trim to reduce API calls
      const uniqueVehicles = new Map<string, any>();
      for (const listing of dealerListings) {
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

      // Apply deal scores to all listings
      for (const listing of dealerListings) {
        const key = `${listing.year}-${listing.make}-${listing.model}-${listing.trim || 'base'}-${Math.round((listing.miles || 60000) / 10000) * 10000}`;
        let marketValue = priceCache.get(key);

        // Fallback to market summary median if no specific prediction
        if (!marketValue && marketSummary?.median_price) {
          marketValue = marketSummary.median_price;
        }

        if (marketValue && listing.price) {
          listing.market_value = marketValue;
          const { score, savings, percentage } = calculateDealScore(listing.price, marketValue);
          listing.deal_score = score;
          listing.savings = savings;
          listing.savings_percentage = percentage;
        } else {
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
    if (SERPAPI_API_KEY) {
      log(`\n=== SERPAPI PRIVATE PARTY SEARCH ===`);

      const searchQuery = [
        year_min && year_max ? `${year_min}-${year_max}` : year_min || year_max || '',
        make,
        model || ''
      ].filter(Boolean).join(' ');

      // Facebook Marketplace search
      try {
        const fbParams = new URLSearchParams({
          api_key: SERPAPI_API_KEY,
          engine: 'facebook_marketplace',
          query: searchQuery,
          location: 'Salt Lake City, Utah, United States', // FB needs city name format
          category: 'vehicles',
        });

        if (max_price) {
          fbParams.set('max_price', String(max_price));
        }
        if (max_miles) {
          fbParams.set('max_mileage', String(max_miles));
        }

        const fbUrl = `https://serpapi.com/search?${fbParams.toString()}`;
        log(`Facebook Marketplace URL: ${fbUrl.replace(SERPAPI_API_KEY, 'KEY_HIDDEN')}`);

        const fbRes = await fetch(fbUrl);
        log(`Facebook Marketplace Response Status: ${fbRes.status}`);

        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const listings = fbData.organic_results || fbData.marketplace_results || [];
          log(`Facebook Marketplace found: ${listings.length} listings`);

          for (const item of listings.slice(0, 20)) {
            const priceMatch = (item.price || item.title || '').match(/\$?([\d,]+)/);
            const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null;

            // Parse year from title
            const yearMatch = (item.title || '').match(/\b(19|20)\d{2}\b/);
            const parsedYear = yearMatch ? parseInt(yearMatch[0]) : null;

            // Parse miles from title or description
            const milesMatch = (item.title + ' ' + (item.snippet || '')).match(/(\d{1,3}[,.]?\d{3})\s*(mi|miles|k\s*mi)/i);
            const parsedMiles = milesMatch ? parseInt(milesMatch[1].replace(/[,\.]/g, '')) : null;

            privateListings.push({
              title: item.title,
              year: parsedYear,
              make: make,
              model: model,
              price: price,
              miles: parsedMiles,
              location: item.location || `Near ${zip_code}`,
              url: item.link || item.url,
              source: 'FB Marketplace',
              thumbnail: item.thumbnail,
            });
          }
        }
      } catch (fbError) {
        log(`Facebook Marketplace Error: ${fbError.message}`);
      }

      // Google search for Craigslist/OfferUp
      try {
        const googleQuery = `${make} ${model || ''} for sale site:craigslist.org OR site:offerup.com`;
        const googleParams = new URLSearchParams({
          api_key: SERPAPI_API_KEY,
          engine: 'google',
          q: googleQuery,
          location: `United States`,
          num: '20',
        });

        const googleUrl = `https://serpapi.com/search?${googleParams.toString()}`;
        log(`Google Search URL: ${googleUrl.replace(SERPAPI_API_KEY, 'KEY_HIDDEN')}`);

        const googleRes = await fetch(googleUrl);
        log(`Google Search Response Status: ${googleRes.status}`);

        if (googleRes.ok) {
          const googleData = await googleRes.json();
          const results = googleData.organic_results || [];
          log(`Google Search found: ${results.length} results`);

          for (const item of results.slice(0, 15)) {
            // Determine source
            let source = 'Private';
            if (item.link?.includes('craigslist')) source = 'Craigslist';
            else if (item.link?.includes('offerup')) source = 'OfferUp';
            else if (item.link?.includes('facebook')) source = 'FB Marketplace';

            // Parse price from title/snippet
            const priceMatch = (item.title + ' ' + (item.snippet || '')).match(/\$?([\d,]+)/);
            const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : null;

            // Skip if price seems unreasonable (likely not a price)
            if (price && (price < 500 || price > 500000)) continue;

            // Parse year
            const yearMatch = (item.title || '').match(/\b(19|20)\d{2}\b/);
            const parsedYear = yearMatch ? parseInt(yearMatch[0]) : null;

            // Parse miles
            const milesMatch = (item.title + ' ' + (item.snippet || '')).match(/(\d{1,3}[,.]?\d{3})\s*(mi|miles|k\s*mi)/i);
            const parsedMiles = milesMatch ? parseInt(milesMatch[1].replace(/[,\.]/g, '')) : null;

            privateListings.push({
              title: item.title,
              year: parsedYear,
              make: make,
              model: model,
              price: price,
              miles: parsedMiles,
              location: item.displayed_link?.split(' › ')[0] || 'Unknown',
              url: item.link,
              source: source,
              thumbnail: null,
            });
          }
        }
      } catch (googleError) {
        log(`Google Search Error: ${googleError.message}`);
      }

      // Estimate deal scores for private listings using market average
      const avgMarketPrice = marketSummary?.median_price || marketSummary?.avg_price;
      if (avgMarketPrice) {
        for (const listing of privateListings) {
          if (listing.price) {
            const { score, savings, percentage } = calculateDealScore(listing.price, avgMarketPrice);
            listing.estimated_deal_score = score;
            listing.estimated_savings = savings;
            listing.savings_percentage = percentage;
          }
        }
      }

      // Sort private listings by price
      privateListings.sort((a, b) => (a.price || 999999) - (b.price || 999999));

      log(`Total private listings: ${privateListings.length}`);
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
