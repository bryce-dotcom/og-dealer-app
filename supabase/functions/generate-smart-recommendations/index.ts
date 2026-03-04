import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");

    const { dealer_id, quantity = 10 } = await req.json();

    console.log("=== SMART RECOMMENDATIONS (HYBRID INTELLIGENCE) ===");
    console.log(`Dealer ID: ${dealer_id}, Quantity: ${quantity}`);

    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Track cost and performance metrics
    let apiCallsMade = 0;
    let cacheHits = 0;
    const startTime = Date.now();

    // Get dealer info
    const { data: dealer, error: dealerError } = await supabase
      .from("dealer_settings")
      .select("dealer_name, city, state, zip")
      .eq("id", dealer_id)
      .maybeSingle();

    if (dealerError) {
      console.error("Error fetching dealer:", dealerError);
    }

    if (!dealer) {
      throw new Error(`Dealer ${dealer_id} not found`);
    }

    const dealerLocation = `${dealer?.city || "Unknown"}, ${dealer?.state || "UT"}`;
    const dealerZip = dealer?.zip || "84065";

    console.log(`Dealer: ${dealer?.dealer_name}, Location: ${dealerLocation}`);

    // STEP 1: Query dealer's proven winners from sales history
    const { data: dealerPrefs, error: prefsError } = await supabase
      .from("dealer_vehicle_preferences")
      .select("*")
      .eq("dealer_id", dealer_id)
      .gte("total_sold", 2) // At least 2 sales to be considered "proven"
      .order("avg_profit", { ascending: false });

    if (prefsError) {
      console.error("Error fetching dealer preferences:", prefsError);
    }

    console.log(`Found ${dealerPrefs?.length || 0} proven makes in dealer history`);

    // STEP 2: Query seasonal patterns
    const { data: seasonalData, error: seasonalError } = await supabase
      .from("seasonal_vehicle_patterns")
      .select("*")
      .eq("dealer_id", dealer_id);

    if (seasonalError) {
      console.error("Error fetching seasonal patterns:", seasonalError);
    }

    console.log(`Found ${seasonalData?.length || 0} seasonal patterns`);

    // Create seasonal lookup map
    const seasonalMap = new Map();
    if (seasonalData) {
      for (const pattern of seasonalData) {
        const key = pattern.model ? `${pattern.make}_${pattern.model}` : pattern.make;
        seasonalMap.set(key, pattern);
      }
    }

    // STEP 3: Determine tier and data strategy
    let tier = "fallback";
    let marketData: any[] = [];
    let topMakes: string[] = [];

    if (dealerPrefs && dealerPrefs.length >= 5) {
      // TIER 1: Internal data only (dealer has strong history)
      tier = "internal";
      console.log("✅ TIER 1 (INTERNAL): Using 100% dealer sales history, ZERO API calls");

      topMakes = dealerPrefs.slice(0, 5).map(p => p.make);

    } else if (dealerPrefs && dealerPrefs.length >= 2) {
      // TIER 2: Hybrid validation (some history, validate with market data)
      tier = "hybrid";
      console.log("🔵 TIER 2 (HYBRID): Validating dealer's top makes with market data");

      topMakes = dealerPrefs.slice(0, 5).map(p => p.make);

      // Make API calls ONLY for dealer's proven makes (5-10 calls max)
      for (const pref of dealerPrefs.slice(0, 5)) {
        try {
          // Check cache first (24h TTL)
          const cacheKey = `market_${dealer_id}_${pref.make}_${pref.model || 'any'}`;
          const { data: cached } = await supabase
            .from("market_intelligence_cache")
            .select("*")
            .eq("dealer_id", dealer_id)
            .eq("cache_key", cacheKey)
            .gte("expires_at", new Date().toISOString())
            .maybeSingle();

          if (cached) {
            console.log(`✅ Cache HIT: ${pref.make} ${pref.model || ''}`);
            cacheHits++;
            marketData.push({
              make: pref.make,
              model: pref.model,
              ...cached.insights,
              cached: true
            });
            continue;
          }

          // Cache miss - call API
          if (!MARKETCHECK_API_KEY) {
            console.log("⚠️ No MarketCheck API key, skipping market validation");
            continue;
          }

          console.log(`🔍 Cache MISS: Fetching ${pref.make} ${pref.model || ''} from MarketCheck`);

          await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit protection

          const params = new URLSearchParams({
            api_key: MARKETCHECK_API_KEY,
            make: pref.make.toLowerCase(),
            year: "2015-2023",
            zip: dealerZip,
            radius: "100",
            car_type: "used",
            price_min: "8000",
            price_max: "40000",
            rows: "50",
            stats: "price,miles,dom"
          });

          if (pref.model) {
            params.set("model", pref.model);
          }

          const apiUrl = `https://mc-api.marketcheck.com/v2/search/car/active?${params.toString()}`;
          const marketRes = await fetch(apiUrl);
          apiCallsMade++;

          if (!marketRes.ok) {
            console.error(`MarketCheck API error for ${pref.make}:`, marketRes.status);
            continue;
          }

          const marketJson = await marketRes.json();
          const listings = marketJson.listings || [];

          console.log(`📊 ${pref.make} ${pref.model || ''}: Found ${listings.length} current listings`);

          if (listings.length === 0) continue;

          // Calculate current market metrics
          const prices = listings.map((l: any) => l.price).filter((p: number) => p > 0);
          const domValues = listings.map((l: any) => l.dom).filter((d: number) => d >= 0);

          const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
          const avgDom = domValues.length > 0 ? domValues.reduce((a, b) => a + b, 0) / domValues.length : 0;

          const insights = {
            inventory_count: listings.length,
            avg_price: Math.round(avgPrice),
            avg_dom: Math.round(avgDom),
            market_temp: avgDom < 30 ? "HOT" : avgDom < 60 ? "WARM" : "COOL",
            supply_level: listings.length > 40 ? "HIGH" : listings.length > 20 ? "MEDIUM" : "LOW"
          };

          marketData.push({
            make: pref.make,
            model: pref.model,
            ...insights,
            cached: false
          });

          // Store in cache (24h TTL)
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await supabase
            .from("market_intelligence_cache")
            .upsert({
              dealer_id,
              cache_key: cacheKey,
              make: pref.make,
              model: pref.model,
              insights,
              expires_at: expiresAt
            });

          console.log(`💾 Cached market data for ${pref.make} ${pref.model || ''}`);

        } catch (err) {
          console.error(`Error fetching market data for ${pref.make}:`, err);
        }
      }

    } else {
      // TIER 3: Industry defaults (new dealer, no history)
      tier = "fallback";
      console.log("⚠️ TIER 3 (FALLBACK): New dealer - using industry defaults");

      const industryDefaults = [
        { make: "Honda", model: "Civic" },
        { make: "Toyota", model: "Camry" },
        { make: "Ford", model: "F-150" },
        { make: "Honda", model: "Accord" },
        { make: "Toyota", model: "RAV4" }
      ];

      topMakes = industryDefaults.map(d => d.make);

      // Make 5 API calls for industry defaults (if API key available)
      if (MARKETCHECK_API_KEY) {
        for (const vehicle of industryDefaults) {
          try {
            await new Promise(resolve => setTimeout(resolve, 300));

            const params = new URLSearchParams({
              api_key: MARKETCHECK_API_KEY,
              make: vehicle.make.toLowerCase(),
              model: vehicle.model,
              year: "2015-2023",
              zip: dealerZip,
              radius: "100",
              car_type: "used",
              price_min: "8000",
              price_max: "35000",
              rows: "50"
            });

            const apiUrl = `https://mc-api.marketcheck.com/v2/search/car/active?${params.toString()}`;
            const marketRes = await fetch(apiUrl);
            apiCallsMade++;

            if (marketRes.ok) {
              const marketJson = await marketRes.json();
              const listings = marketJson.listings || [];

              const prices = listings.map((l: any) => l.price).filter((p: number) => p > 0);
              const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

              marketData.push({
                make: vehicle.make,
                model: vehicle.model,
                inventory_count: listings.length,
                avg_price: Math.round(avgPrice),
                market_source: "industry_default"
              });
            }
          } catch (err) {
            console.error(`Error fetching default ${vehicle.make} ${vehicle.model}:`, err);
          }
        }
      }
    }

    // STEP 4: Build AI prompt with appropriate data tier
    const currentMonth = new Date().toLocaleString("default", { month: "long" });
    const currentYear = new Date().getFullYear();

    let dealerHistoryText = "";
    if (dealerPrefs && dealerPrefs.length > 0) {
      dealerHistoryText = dealerPrefs.slice(0, 10).map(p => {
        const seasonal = seasonalMap.get(p.model ? `${p.make}_${p.model}` : p.make);
        const bestBuy = seasonal?.best_buy_months?.map((m: number) =>
          new Date(2000, m - 1).toLocaleString('default', { month: 'short' })
        ).join(', ') || 'Unknown';
        const bestSell = seasonal?.best_sell_months?.map((m: number) =>
          new Date(2000, m - 1).toLocaleString('default', { month: 'short' })
        ).join(', ') || 'Unknown';

        return `- ${p.make} ${p.model || '(any model)'}: Sold ${p.total_sold} units, $${Math.round(p.avg_profit || 0).toLocaleString()} avg profit, ${p.avg_days_on_lot || '?'} days on lot, ${((p.success_rate || 0) * 100).toFixed(0)}% success rate
  Historical: Buy avg $${Math.round(p.avg_purchase_price || 0).toLocaleString()}, Sell avg $${Math.round(p.avg_sale_price || 0).toLocaleString()}
  Seasonal: Best buy months: ${bestBuy}, Best sell months: ${bestSell}`;
      }).join('\n\n');
    } else {
      dealerHistoryText = "No sales history available (new dealer)";
    }

    let marketDataText = "";
    if (marketData.length > 0) {
      marketDataText = marketData.map(m =>
        `- ${m.make} ${m.model || ''}: ${m.inventory_count || '?'} available, Avg price $${m.avg_price?.toLocaleString() || 'N/A'}, ${m.avg_dom || '?'} DOM, ${m.market_temp || '?'} market, ${m.supply_level || '?'} supply${m.cached ? ' (cached)' : ''}`
      ).join('\n');
    } else {
      marketDataText = "No current market data available";
    }

    const prompt = `You are a vehicle acquisition analyst for a used car dealer in ${dealerLocation}.

DATA TIER: ${tier.toUpperCase()}
${tier === 'internal' ? '✅ Using dealer\'s proven track record (no market data needed)' :
  tier === 'hybrid' ? '🔵 Blending dealer history with current market validation' :
  '⚠️ New dealer - using safe industry defaults'}

YOUR PROVEN WINNERS (Last 24 months actual sales):
${dealerHistoryText}

${tier === 'hybrid' ? `CURRENT MARKET DATA (100mi radius, validated):
${marketDataText}
` : ''}

CONTEXT:
- Current month: ${currentMonth} ${currentYear}
- Location: ${dealerLocation}
- Focus: BHPH-friendly vehicles ($8k-$35k range)

TASK: Recommend top ${quantity} vehicles based on ${tier === 'internal' ? 'DEALER\'S PROVEN TRACK RECORD' : tier === 'hybrid' ? 'DEALER HISTORY + CURRENT MARKET' : 'SAFE INDUSTRY STANDARDS'}.

For each recommendation, provide:
1. **Historical Performance**: Cite dealer's actual metrics (your avg profit, times sold, days on lot)
2. **Seasonal Timing**: Reference best buy/sell months from seasonal data
3. **Current Market** (if Tier 2): Validate with current inventory/pricing
4. **Sourcing Strategy**: Specific advice (auctions, private party, wholesale)
5. **Action Plan**: Exact target buy price, expected sale price, estimated profit

${tier === 'fallback' ? `
⚠️ IMPORTANT: This dealer is NEW with no sales history.
- Recommendations are SAFE INDUSTRY DEFAULTS (Honda Civic, Toyota Camry, etc.)
- Clearly state these are "industry standard" picks, not personalized
- Encourage dealer to track sales for future personalized recommendations
` : ''}

DATA SOURCE TRANSPARENCY:
- "Your average" or "You've sold" = Dealer's actual sales history
- "Current market shows" = MarketCheck API data (if Tier 2)
- "Estimated" or "Industry standard" = AI inference or defaults

Return JSON:
{
  "recommendations": [
    {
      "rank": 1,
      "make": "Honda",
      "model": "Civic",
      "year_range": "2015-2022",
      "confidence_source": "${tier === 'internal' ? 'dealer_history' : tier === 'hybrid' ? 'market_validated' : 'industry_default'}",
      "times_sold": <number from dealer history, or null>,
      "your_historical_profit": <avg profit from dealer history, or null>,
      "your_avg_days_on_lot": <from dealer history, or null>,
      "current_market_price": <from market data if available, or null>,
      "current_market_dom": <from market data if available, or null>,
      "seasonal_buy_months": ["Feb", "Mar"],
      "seasonal_sell_months": ["Jun", "Jul"],
      "target_buy_price": <specific dollar amount>,
      "target_sell_price": <specific dollar amount>,
      "estimated_profit": <target_sell - target_buy - recon>,
      "estimated_recon": <800-2000 based on price point>,
      "reasoning": "Clear explanation citing ACTUAL data sources",
      "where_to_find": ["Dealer auctions", "Copart", "Wholesale groups"],
      "action_item": "Specific next step"
    }
  ],
  "market_insights": "2-3 sentences summarizing key opportunities. ${tier === 'fallback' ? 'Clearly state these are industry defaults for a new dealer.' : 'Reference dealer\'s proven patterns and seasonal timing.'}"
}

CRITICAL: Return ONLY valid JSON. No markdown, no code blocks, just JSON starting with { and ending with }.`;

    console.log("Calling Claude AI for intelligent analysis...");

    // STEP 5: Get AI analysis
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      throw new Error(`Anthropic API error: ${anthropicRes.status}`);
    }

    const anthropicData = await anthropicRes.json();
    let aiText = anthropicData.content?.[0]?.text || "{}";

    console.log("AI response received (length:", aiText.length, ")");

    // Parse AI response
    let result;
    try {
      // Clean up markdown if present
      aiText = aiText.trim();
      if (aiText.startsWith('```json')) {
        aiText = aiText.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      } else if (aiText.startsWith('```')) {
        aiText = aiText.replace(/```\n?/g, '').trim();
      }

      result = JSON.parse(aiText);
      console.log(`✅ AI returned ${result.recommendations?.length || 0} recommendations`);

    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("AI text (first 500 chars):", aiText.substring(0, 500));

      // Fallback: Create basic recommendations from dealer history or defaults
      if (dealerPrefs && dealerPrefs.length > 0) {
        result = {
          recommendations: dealerPrefs.slice(0, quantity).map((p, i) => ({
            rank: i + 1,
            make: p.make,
            model: p.model,
            year_range: "2015-2022",
            confidence_source: "dealer_history",
            times_sold: p.total_sold,
            your_historical_profit: Math.round(p.avg_profit || 0),
            your_avg_days_on_lot: p.avg_days_on_lot,
            target_buy_price: Math.round((p.avg_purchase_price || 20000) * 0.95),
            target_sell_price: Math.round(p.avg_sale_price || 25000),
            estimated_profit: Math.round(p.avg_profit || 0),
            estimated_recon: 1200,
            reasoning: `Based on your history: Sold ${p.total_sold} units with $${Math.round(p.avg_profit || 0)} avg profit in ${p.avg_days_on_lot || '?'} days`,
            where_to_find: ["Dealer auctions", "Wholesale groups", "Trade-ins"],
            action_item: "Target similar units based on your proven success"
          })),
          market_insights: "Using your proven track record. AI parsing failed but recommendations are based on your actual sales data."
        };
      } else {
        // Industry defaults fallback
        const defaults = [
          { make: "Honda", model: "Civic", buy: 12000, sell: 15500 },
          { make: "Toyota", model: "Camry", buy: 13000, sell: 16500 },
          { make: "Ford", model: "F-150", buy: 20000, sell: 25000 },
          { make: "Honda", model: "Accord", buy: 11000, sell: 14500 },
          { make: "Toyota", model: "RAV4", buy: 15000, sell: 19000 }
        ];

        result = {
          recommendations: defaults.slice(0, quantity).map((d, i) => ({
            rank: i + 1,
            make: d.make,
            model: d.model,
            year_range: "2015-2022",
            confidence_source: "industry_default",
            times_sold: null,
            your_historical_profit: null,
            target_buy_price: d.buy,
            target_sell_price: d.sell,
            estimated_profit: d.sell - d.buy - 1200,
            estimated_recon: 1200,
            reasoning: `Industry standard: ${d.make} ${d.model} is a proven BHPH performer with strong resale value`,
            where_to_find: ["Dealer auctions", "Manheim", "Copart"],
            action_item: "Safe bet for new dealers - track your results"
          })),
          market_insights: "⚠️ New dealer: These are safe industry defaults. Track your sales to get personalized recommendations."
        };
      }
    }

    // Calculate performance metrics
    const elapsedMs = Date.now() - startTime;
    const estimatedCost = apiCallsMade * 0.02; // Rough estimate: $0.02 per API call

    // Add metadata to response
    const response = {
      ...result,
      tier,
      cost_breakdown: {
        api_calls_made: apiCallsMade,
        cache_hits: cacheHits,
        estimated_cost: estimatedCost,
        elapsed_ms: elapsedMs
      },
      dealer_context: {
        location: dealerLocation,
        proven_makes_count: dealerPrefs?.length || 0,
        has_seasonal_data: (seasonalData?.length || 0) > 0
      }
    };

    console.log("=== SMART RECOMMENDATIONS COMPLETE ===");
    console.log(`Tier: ${tier}, API Calls: ${apiCallsMade}, Cache Hits: ${cacheHits}, Cost: $${estimatedCost.toFixed(4)}, Time: ${elapsedMs}ms`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-smart-recommendations:", error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      error_details: error.stack || String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
