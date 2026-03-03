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

    const { dealer_id, budget_max, quantity } = await req.json();

    console.log("=== MARKET INTELLIGENCE ANALYSIS ===");
    console.log(`Dealer ID: ${dealer_id}`);

    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    if (!MARKETCHECK_API_KEY) throw new Error("MARKETCHECK_API_KEY not configured");

    // Get dealer info for location
    const { data: dealer } = await supabase
      .from("dealer_settings")
      .select("zip, city, state")
      .eq("id", dealer_id)
      .single();

    const dealerZip = dealer?.zip || "84065";
    const dealerLocation = `${dealer?.city || "American Fork"}, ${dealer?.state || "UT"}`;

    console.log(`Dealer location: ${dealerLocation} (${dealerZip})`);

    // Get dealer's historical preferences (optional context, not required)
    const { data: preferences } = await supabase
      .from("dealer_vehicle_preferences")
      .select("*")
      .eq("dealer_id", dealer_id)
      .gte("total_sold", 2)
      .order("avg_profit", { ascending: false })
      .limit(5);

    // STEP 1: Analyze REAL market data - popular BHPH models
    const popularModels = [
      { make: "Ford", model: "F-150" },
      { make: "Chevrolet", model: "Silverado 1500" },
      { make: "Ram", model: "1500" },
      { make: "Honda", model: "Civic" },
      { make: "Toyota", model: "Camry" },
      { make: "Honda", model: "Accord" },
      { make: "Toyota", model: "Corolla" },
      { make: "Chevrolet", model: "Equinox" },
      { make: "Ford", model: "Escape" },
      { make: "Nissan", model: "Altima" }
    ];

    console.log("Analyzing market data for popular BHPH models...");

    const marketData = [];

    for (const vehicle of popularModels) {
      try {
        // Search MarketCheck for this make/model in dealer's area
        const params = new URLSearchParams({
          api_key: MARKETCHECK_API_KEY,
          make: vehicle.make.toLowerCase(),
          model: vehicle.model,
          year: "2015-2022",
          zip: dealerZip,
          radius: "100",
          car_type: "used",
          price_min: "8000",
          price_max: budget_max ? budget_max.toString() : "35000",
          rows: "50",
          sort_by: "price",
          sort_order: "asc",
          stats: "price,miles,dom"
        });

        const apiUrl = `https://mc-api.marketcheck.com/v2/search/car/active?${params.toString()}`;
        console.log(`Fetching: ${vehicle.make} ${vehicle.model} from ${dealerZip}`);

        const marketRes = await fetch(apiUrl);

        if (!marketRes.ok) {
          const errorText = await marketRes.text();
          console.error(`MarketCheck error for ${vehicle.make} ${vehicle.model}:`, {
            status: marketRes.status,
            statusText: marketRes.statusText,
            error: errorText,
            url: apiUrl.replace(MARKETCHECK_API_KEY, 'REDACTED')
          });
          continue;
        }

        const marketJson = await marketRes.json();
        const listings = marketJson.listings || [];

        if (listings.length === 0) continue;

        // Calculate market intelligence
        const prices = listings.map((l: any) => l.price).filter((p: number) => p > 0);
        const domValues = listings.map((l: any) => l.dom).filter((d: number) => d >= 0);

        const avgPrice = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0;
        const medianPrice = prices.length > 0 ? prices.sort((a: number, b: number) => a - b)[Math.floor(prices.length / 2)] : 0;
        const avgDom = domValues.length > 0 ? domValues.reduce((a: number, b: number) => a + b, 0) / domValues.length : 0;

        // Find deals (priced significantly below average)
        const dealsAvailable = listings.filter((l: any) =>
          l.price > 0 && l.price < avgPrice * 0.90
        ).length;

        // Get price predictions for accurate MMR
        const sampleVin = listings.find((l: any) => l.vin)?.vin;
        let avgMmr = null;

        if (sampleVin) {
          try {
            const predParams = new URLSearchParams({
              api_key: MARKETCHECK_API_KEY,
              vin: sampleVin,
              miles: String(listings[0]?.miles || 60000),
              car_type: "used"
            });

            const predRes = await fetch(
              `https://mc-api.marketcheck.com/v2/predict/car/price?${predParams.toString()}`
            );

            if (predRes.ok) {
              const predData = await predRes.json();
              avgMmr = predData.predicted_price || predData.price || predData.adjusted_price || predData.retail_price;
            }
          } catch (e) {
            console.error("Price prediction error:", e);
          }
        }

        marketData.push({
          make: vehicle.make,
          model: vehicle.model,
          inventory_count: listings.length,
          avg_price: Math.round(avgPrice),
          median_price: Math.round(medianPrice),
          avg_mmr: avgMmr ? Math.round(avgMmr) : null,
          avg_days_on_market: Math.round(avgDom),
          deals_available: dealsAvailable,
          market_temperature: avgDom < 30 ? "HOT" : avgDom < 45 ? "WARM" : "COOL",
          supply_level: listings.length > 40 ? "HIGH" : listings.length > 20 ? "MEDIUM" : "LOW"
        });

        console.log(`✓ ${vehicle.make} ${vehicle.model}: ${listings.length} units, avg $${Math.round(avgPrice)}, ${Math.round(avgDom)} DOM`);

      } catch (err) {
        console.error(`Error analyzing ${vehicle.make} ${vehicle.model}:`, err);
      }
    }

    console.log(`Analyzed ${marketData.length} vehicle types in market`);

    if (marketData.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "No market data available",
        message: `Unable to find inventory data for ${dealerLocation} (${dealerZip}). This could be: (1) No inventory in 100-mile radius, (2) MarketCheck API issue, or (3) Rate limit. Check Edge Function logs for details.`,
        debug: {
          dealer_zip: dealerZip,
          dealer_location: dealerLocation,
          models_searched: popularModels.length,
          marketcheck_api_configured: !!MARKETCHECK_API_KEY
        },
        recommendations: [],
        market_insights: ""
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 2: Build AI prompt with REAL market intelligence
    const marketDataText = marketData
      .map(m =>
        `- ${m.make} ${m.model}: ${m.inventory_count} available, $${m.avg_price.toLocaleString()} avg, ${m.avg_days_on_market} DOM, ${m.deals_available} deals under market, Market: ${m.market_temperature}, Supply: ${m.supply_level}${m.avg_mmr ? `, MMR: $${m.avg_mmr.toLocaleString()}` : ""}`
      )
      .join("\n");

    const dealerHistoryText = preferences && preferences.length > 0
      ? preferences
          .map(p => `- ${p.make} ${p.model || ""}: ${p.total_sold} sold, $${Math.round(p.avg_profit || 0)} profit, ${p.avg_days_on_lot || "?"} days`)
          .join("\n")
      : "No sales history available";

    const currentMonth = new Date().toLocaleString("default", { month: "long" });
    const currentYear = new Date().getFullYear();

    const prompt = `You are an expert vehicle acquisition analyst. A BHPH dealer in ${dealerLocation} needs to know EXACTLY what to buy RIGHT NOW to make maximum profit.

REAL-TIME MARKET DATA (${dealerLocation} area, 100 mile radius):
${marketDataText}

DEALER'S PAST SUCCESS (context only):
${dealerHistoryText}

MARKET CONTEXT:
- Current: ${currentMonth} ${currentYear}
- Budget: ${budget_max ? "$" + budget_max.toLocaleString() : "$8k-$35k BHPH sweet spot"}
- DOM = Days on Market (lower = faster selling)
- "Deals" = vehicles priced 10%+ below average

YOUR MISSION:
Recommend the TOP ${quantity || 5} vehicles this dealer should ACTIVELY BUY based on REAL market opportunities.

CRITICAL: Use ONLY the REAL data provided above. NO GUESSING.
- expected_profit = avg_mmr - avg_price (if no MMR, skip that vehicle)
- expected_days_to_sell = avg_days_on_market from data
- target_price_max = avg_price or median_price from data
- reasoning MUST cite actual numbers (DOM, deals available, supply level, MMR spread)

1. **PRIORITIZE HOT MARKETS** - Low DOM means high demand (use actual DOM numbers)
2. **FIND THE DEALS** - Models with deals_available > 0
3. **BALANCE SUPPLY** - LOW supply + HOT market = pricing power
4. **CALCULATE REAL MARGINS** - Only recommend if avg_mmr > avg_price (real profit)
5. **BE SPECIFIC** - Use year range 2015-2022 (what we searched), cite actual prices
6. **ACTIONABLE INTEL** - Must be backed by real market data

Return ONLY valid JSON:
{
  "recommendations": [
    {
      "rank": 1,
      "make": "Ford",
      "model": "F-150",
      "year_range": "2018-2020",
      "target_price_max": 32000,
      "expected_profit": 4500,
      "expected_days_to_sell": 25,
      "reasoning": "HOT MARKET: Only 28 DOM, 12 deals available under $30k, low supply (22 units) = pricing power. Market avg $31,500 vs MMR $34,200 = $2,700 built-in margin.",
      "where_to_find": ["Manheim/ADESA auctions", "Private party (Facebook, Craigslist)", "Wholesale groups"],
      "action_item": "Target 2018-2020 XLT trim, 4WD, under 80k miles. Pay up to $32k for clean title."
    }
  ],
  "market_insights": "2-3 sentence summary of BIGGEST opportunities in this market right now. Be specific and actionable."
}

Return ONLY the JSON. Make this dealer money.`;

    console.log("Calling AI for market analysis...");

    // STEP 3: Get AI analysis
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      throw new Error(`Anthropic API error: ${anthropicRes.status}`);
    }

    const anthropicData = await anthropicRes.json();
    const aiText = anthropicData.content?.[0]?.text || "{}";

    console.log("AI Response:", aiText);

    // Parse response
    let recommendations;
    try {
      recommendations = JSON.parse(aiText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);

      // Fallback: Use top 5 hottest markets (ONLY if AI fails - uses REAL data only)
      const topMarkets = marketData
        .filter(m => m.deals_available > 0 && m.avg_mmr) // Only include if we have MMR (real profit data)
        .sort((a, b) => {
          // Score: lower DOM + more deals = better
          const scoreA = (50 - a.avg_days_on_market) + (a.deals_available * 2);
          const scoreB = (50 - b.avg_days_on_market) + (b.deals_available * 2);
          return scoreB - scoreA;
        })
        .slice(0, quantity || 5);

      recommendations = {
        recommendations: topMarkets.map((m, i) => ({
          rank: i + 1,
          make: m.make,
          model: m.model,
          year_range: "2015-2022", // Match the data we actually searched
          target_price_max: m.avg_price,
          expected_profit: m.avg_mmr - m.avg_price, // REAL: MMR - Avg Price (no guessing)
          expected_days_to_sell: m.avg_days_on_market, // REAL: Actual DOM from market
          reasoning: `REAL DATA: ${m.market_temperature} market (${m.avg_days_on_market} DOM actual), ${m.deals_available} deals available under market avg, ${m.supply_level} supply (${m.inventory_count} units). Avg $${m.avg_price.toLocaleString()} vs MMR $${m.avg_mmr.toLocaleString()} = $${(m.avg_mmr - m.avg_price).toLocaleString()} margin.`,
          where_to_find: ["Dealer auctions (Manheim, ADESA)", "Private party (Facebook Marketplace, Craigslist)", "Wholesale/trade-ins"],
          action_item: `Target ${m.make} ${m.model} 2015-2022, pay up to $${m.avg_price.toLocaleString()} for clean title with ${m.avg_mmr > 0 ? `$${(m.avg_mmr - m.avg_price).toLocaleString()} margin` : 'verified MMR'}`
        })),
        market_insights: `AI parsing failed - showing raw market data. Top opportunity: ${topMarkets[0].make} ${topMarkets[0].model} moving in ${topMarkets[0].avg_days_on_market} days with ${topMarkets[0].deals_available} deals priced below $${topMarkets[0].avg_price.toLocaleString()}. Market avg $${topMarkets[0].avg_price.toLocaleString()} vs MMR $${topMarkets[0].avg_mmr.toLocaleString()}.`
      };
    }

    console.log(`Generated ${recommendations.recommendations?.length || 0} market-based recommendations`);

    return new Response(JSON.stringify(recommendations), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-buying-recommendations:", error);

    // Return detailed error for debugging
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      error_details: error.stack || String(error),
      timestamp: new Date().toISOString()
    }), {
      status: 200, // Return 200 so frontend can see the error details
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
