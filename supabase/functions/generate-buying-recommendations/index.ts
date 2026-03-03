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

    const { dealer_id, budget_max, quantity = 10 } = await req.json();

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

    // STEP 1: Analyze REAL market data - popular used car models
    const popularModels = [
      // Trucks
      { make: "Ford", model: "F-150" },
      { make: "Chevrolet", model: "Silverado 1500" },
      { make: "Ram", model: "1500" },
      { make: "GMC", model: "Sierra 1500" },
      { make: "Toyota", model: "Tacoma" },
      { make: "Toyota", model: "Tundra" },
      { make: "Ford", model: "Ranger" },
      { make: "Chevrolet", model: "Colorado" },
      // SUVs
      { make: "Chevrolet", model: "Tahoe" },
      { make: "Chevrolet", model: "Suburban" },
      { make: "Ford", model: "Explorer" },
      { make: "Ford", model: "Expedition" },
      { make: "Jeep", model: "Wrangler" },
      { make: "Jeep", model: "Grand Cherokee" },
      { make: "Toyota", model: "4Runner" },
      { make: "Honda", model: "CR-V" },
      { make: "Toyota", model: "RAV4" },
      { make: "Chevrolet", model: "Equinox" },
      { make: "Ford", model: "Escape" },
      { make: "Nissan", model: "Rogue" },
      // Sedans
      { make: "Honda", model: "Civic" },
      { make: "Toyota", model: "Camry" },
      { make: "Honda", model: "Accord" },
      { make: "Toyota", model: "Corolla" },
      { make: "Nissan", model: "Altima" }
    ];

    console.log("Analyzing market data for popular models...");

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

        // Calculate profit margin (only if we have MMR)
        const estimatedRecon = 1500; // Typical BHPH recon cost
        const grossMargin = avgMmr ? Math.round(avgPrice - avgMmr - estimatedRecon) : null;

        marketData.push({
          make: vehicle.make,
          model: vehicle.model,
          inventory_count: listings.length,
          avg_price: Math.round(avgPrice), // RETAIL (what dealers are selling for)
          median_price: Math.round(medianPrice),
          avg_mmr: avgMmr ? Math.round(avgMmr) : null, // WHOLESALE (what you should pay)
          avg_days_on_market: Math.round(avgDom),
          deals_available: dealsAvailable,
          estimated_profit: grossMargin, // CORRECT: Retail - Wholesale - Recon
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
        `- ${m.make} ${m.model}: ${m.inventory_count} available, Retail avg: $${m.avg_price.toLocaleString()}, DOM: ${m.avg_days_on_market}, Deals available: ${m.deals_available}, Market: ${m.market_temperature}, Supply: ${m.supply_level}${m.avg_mmr ? `, Wholesale (MMR): $${m.avg_mmr.toLocaleString()}, Est. Profit: $${m.estimated_profit?.toLocaleString() || 'N/A'} (Retail - Wholesale - $1500 recon)` : ""}`
      )
      .join("\n");

    const dealerHistoryText = preferences && preferences.length > 0
      ? preferences
          .map(p => `- ${p.make} ${p.model || ""}: ${p.total_sold} sold, $${Math.round(p.avg_profit || 0)} profit, ${p.avg_days_on_lot || "?"} days`)
          .join("\n")
      : "No sales history available";

    const currentMonth = new Date().toLocaleString("default", { month: "long" });
    const currentYear = new Date().getFullYear();

    const prompt = `You are an expert vehicle acquisition analyst. A used car dealer in ${dealerLocation} needs to know EXACTLY what to buy RIGHT NOW to make maximum profit.

REAL-TIME MARKET DATA (${dealerLocation} area, 100 mile radius):
${marketDataText}

DEALER'S PAST SUCCESS (context only):
${dealerHistoryText}

MARKET CONTEXT:
- Current: ${currentMonth} ${currentYear}
- Budget: ${budget_max ? "Up to $" + budget_max.toLocaleString() : "Focus on $8k-$40k range"}
- DOM = Days on Market (lower = faster selling)
- "Deals" = vehicles priced 10%+ below average

YOUR MISSION:
Recommend the TOP ${quantity} vehicles this dealer should ACTIVELY BUY based on REAL market opportunities.

CRITICAL UNDERSTANDING:
- avg_price = RETAIL (what dealers are selling for)
- avg_mmr (MMR) = WHOLESALE book value (what you should pay at auction)
- Est. Profit = Retail - Wholesale - Recon ($1500)
- ONLY RECOMMEND vehicles with POSITIVE profit margins

RULES - Use ONLY REAL data, NO GUESSING:
- expected_profit = Use the "Est. Profit" provided in data (already calculated)
- expected_days_to_sell = avg_days_on_market from data
- target_price_max = avg_mmr (wholesale value - what you should pay)
- reasoning MUST cite actual numbers and explain the margin

1. **ONLY PROFITABLE VEHICLES** - Must have positive Est. Profit (Retail > Wholesale + Recon)
2. **PRIORITIZE HOT MARKETS** - Low DOM = fast turn (use actual DOM numbers)
3. **FIND THE DEALS** - Models with deals_available > 0 (inventory priced below retail avg)
4. **BALANCE SUPPLY** - LOW supply + HOT market = pricing power
5. **BE SPECIFIC** - Target price = MMR (wholesale), expected sale = retail avg
6. **ACTIONABLE INTEL** - Must be backed by real profit margins from data

Return ONLY valid JSON:
{
  "recommendations": [
    {
      "rank": 1,
      "make": "Ford",
      "model": "F-150",
      "year_range": "2015-2022",
      "target_price_max": 28000,
      "expected_profit": 3500,
      "expected_days_to_sell": 28,
      "reasoning": "PROFITABLE: Retail avg $33,000, Wholesale (MMR) $28,000 = $3,500 profit after $1,500 recon. HOT market (28 DOM), 15 deals available, LOW supply (24 units) = pricing power.",
      "where_to_find": ["Dealer auctions (pay ~MMR $28k)", "Wholesale groups", "Private party deals"],
      "action_item": "Buy at $28,000 (MMR wholesale), sell at $33,000 (market retail), net $3,500 after recon. Target clean title, under 100k miles."
    }
  ],
  "market_insights": "2-3 sentence summary of BIGGEST opportunities in this market right now. Be specific and actionable."
}

CRITICAL: Return ONLY valid JSON. No markdown, no explanation, no code blocks. Just pure JSON starting with { and ending with }.`;

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

    console.log("AI Response (first 200 chars):", aiText.substring(0, 200));

    // Parse response
    let recommendations;
    try {
      // Try to extract JSON if AI wrapped it in markdown code blocks
      let jsonText = aiText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }

      recommendations = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("AI text (first 500 chars):", aiText.substring(0, 500));

      // Fallback: Use top profitable markets (ONLY if AI fails - uses REAL data only)
      const topMarkets = marketData
        .filter(m =>
          m.avg_mmr &&
          m.estimated_profit &&
          m.estimated_profit > 300 && // At least $300 profit
          m.avg_days_on_market < 90    // Moves in under 90 days
        )
        .sort((a, b) => {
          // Score: higher profit + lower DOM + more deals = better
          const scoreA = (a.estimated_profit || 0) * 2 + (60 - a.avg_days_on_market) * 10 + (a.deals_available * 50);
          const scoreB = (b.estimated_profit || 0) * 2 + (60 - b.avg_days_on_market) * 10 + (b.deals_available * 50);
          return scoreB - scoreA;
        })
        .slice(0, quantity || 5);

      recommendations = {
        recommendations: topMarkets.map((m, i) => ({
          rank: i + 1,
          make: m.make,
          model: m.model,
          year_range: "2015-2022",
          target_price_max: m.avg_mmr, // Pay wholesale (MMR)
          expected_profit: m.estimated_profit, // CORRECT: Retail - Wholesale - Recon
          expected_days_to_sell: m.avg_days_on_market,
          reasoning: `PROFITABLE: Retail avg $${m.avg_price.toLocaleString()}, Wholesale (MMR) $${m.avg_mmr.toLocaleString()} = $${m.estimated_profit.toLocaleString()} profit after $1,500 recon. ${m.market_temperature} market (${m.avg_days_on_market} DOM), ${m.deals_available} deals available, ${m.supply_level} supply (${m.inventory_count} units).`,
          where_to_find: ["Dealer auctions (target MMR $" + m.avg_mmr.toLocaleString() + ")", "Wholesale groups", "Private party deals under retail"],
          action_item: `Buy at $${m.avg_mmr.toLocaleString()} (wholesale), sell at $${m.avg_price.toLocaleString()} (market retail), net $${m.estimated_profit.toLocaleString()} profit after recon.`
        })),
        market_insights: `AI parsing failed - showing calculated data. Top profit: ${topMarkets[0].make} ${topMarkets[0].model} with $${topMarkets[0].estimated_profit.toLocaleString()} margin (Buy $${topMarkets[0].avg_mmr.toLocaleString()} wholesale, Sell $${topMarkets[0].avg_price.toLocaleString()} retail). Moves in ${topMarkets[0].avg_days_on_market} days.`
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
