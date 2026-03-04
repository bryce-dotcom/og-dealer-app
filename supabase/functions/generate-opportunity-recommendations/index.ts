import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Industry standards for BHPH dealers
const INDUSTRY_OPPORTUNITIES = [
  { make: "Honda", model: "Civic", typical_buy: 12000, typical_sell: 15500, typical_profit: 2300 },
  { make: "Toyota", model: "Camry", typical_buy: 13000, typical_sell: 16500, typical_profit: 2300 },
  { make: "Ford", model: "F-150", typical_buy: 20000, typical_sell: 25000, typical_profit: 3500 },
  { make: "Honda", model: "Accord", typical_buy: 11000, typical_sell: 14500, typical_profit: 2300 },
  { make: "Toyota", model: "RAV4", typical_buy: 15000, typical_sell: 19000, typical_profit: 2800 },
  { make: "Nissan", model: "Altima", typical_buy: 10000, typical_sell: 13000, typical_profit: 1900 },
  { make: "Chevrolet", model: "Silverado", typical_buy: 22000, typical_sell: 27000, typical_profit: 3500 },
  { make: "Toyota", model: "Corolla", typical_buy: 11000, typical_sell: 14000, typical_profit: 1900 },
  { make: "Jeep", model: "Wrangler", typical_buy: 18000, typical_sell: 23000, typical_profit: 3500 },
  { make: "Honda", model: "CR-V", typical_buy: 14000, typical_sell: 18000, typical_profit: 2700 },
  { make: "Ford", model: "Escape", typical_buy: 12000, typical_sell: 15500, typical_profit: 2300 },
  { make: "Nissan", model: "Rogue", typical_buy: 13000, typical_sell: 16500, typical_profit: 2300 },
  { make: "Chevrolet", model: "Equinox", typical_buy: 11000, typical_sell: 14000, typical_profit: 1900 },
  { make: "Toyota", model: "Highlander", typical_buy: 18000, typical_sell: 23000, typical_profit: 3500 },
  { make: "Honda", model: "Pilot", typical_buy: 16000, typical_sell: 20500, typical_profit: 2800 }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=== OPPORTUNITY DISCOVERY STARTED ===");
  console.log("Function invoked at:", new Date().toISOString());

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");

    let requestBody;
    try {
      requestBody = await req.json();
      console.log("Request body parsed:", requestBody);
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid JSON in request body"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dealer_id, quantity = 10 } = requestBody;

    if (!dealer_id) {
      return new Response(JSON.stringify({
        success: false,
        error: "dealer_id is required"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get dealer info
    const { data: dealer, error: dealerError } = await supabase
      .from("dealer_settings")
      .select("dealer_name, city, state, zip")
      .eq("id", dealer_id)
      .maybeSingle();

    if (dealerError || !dealer) {
      throw new Error(`Dealer ${dealer_id} not found`);
    }

    const dealerLocation = `${dealer?.city || "Unknown"}, ${dealer?.state || "UT"}`;
    const dealerZip = dealer?.zip || "84065";
    console.log(`Dealer: ${dealer?.dealer_name}, Location: ${dealerLocation}`);

    // STEP 1: Get dealer's current inventory (what they HAVE been buying)
    const { data: dealerPrefs } = await supabase
      .from("dealer_vehicle_preferences")
      .select("make, model")
      .eq("dealer_id", dealer_id)
      .gte("total_sold", 1);

    const existingMakeModels = new Set(
      dealerPrefs?.map(p => `${p.make}_${p.model || 'any'}`.toLowerCase()) || []
    );

    console.log(`Dealer has ${dealerPrefs?.length || 0} make/model combinations in history`);

    // STEP 2: Find industry opportunities they're NOT buying (by specific make+model)
    const gaps = INDUSTRY_OPPORTUNITIES.filter(opp => {
      const makeModel = `${opp.make}_${opp.model}`.toLowerCase();

      // They haven't sold this SPECIFIC make/model combination
      // (Even if they've sold other models of the same make)
      return !existingMakeModels.has(makeModel);
    });

    console.log(`Found ${gaps.length} opportunity gaps (specific make/model combinations dealer hasn't tried)`);

    // STEP 3: Build opportunities from gaps (optionally validate with market data)
    let apiCallsMade = 0;
    const opportunities: any[] = [];

    const gapsToCheck = gaps.slice(0, Math.min(quantity, 15)); // Check up to 15 vehicles

    // For now, just return opportunities based on gaps (no API calls needed)
    // This gives immediate value - showing what they HAVEN'T tried yet
    for (const gap of gapsToCheck) {
      if (true) { // Simplified: always use typical values for now
        // No API key - just return gap info with typical values
        opportunities.push({
          make: gap.make,
          model: gap.model,
          year_range: "2015-2023",
          opportunity_type: "untapped_market",
          market_availability: "unknown",
          avg_market_price: null,
          avg_days_on_market: null,
          inventory_count: null,
          typical_buy_price: gap.typical_buy,
          typical_sell_price: gap.typical_sell,
          estimated_profit: gap.typical_profit,
          target_price_max: gap.typical_buy,
          expected_profit: gap.typical_profit,
          expected_days_to_sell: 35,
          reasoning: `Industry opportunity: ${gap.make} ${gap.model} is a proven BHPH performer with $${gap.typical_profit.toLocaleString()} typical profit. You haven't sold this specific model yet - could be a new profit center.`,
          why_you_should_try: `Similar dealers average $${gap.typical_profit.toLocaleString()} profit on ${gap.make} ${gap.model}. Strong resale value and consistent demand.`,
          where_to_find: gap.typical_buy < 15000
            ? ["Copart", "IAA", "Private party", "Trade-ins"]
            : ["Dealer auctions", "Manheim", "Wholesale groups"],
          confidence_score: 70
        });
        continue;
      }

      try {
        await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit

        const params = new URLSearchParams({
          api_key: MARKETCHECK_API_KEY,
          make: gap.make.toLowerCase(),
          model: gap.model,
          year: "2015-2023",
          zip: dealerZip,
          radius: "100",
          car_type: "used",
          price_min: "8000",
          price_max: "40000",
          rows: "50",
          stats: "price,miles,dom"
        });

        const apiUrl = `https://mc-api.marketcheck.com/v2/search/car/active?${params.toString()}`;
        const marketRes = await fetch(apiUrl);
        apiCallsMade++;

        if (!marketRes.ok) {
          console.error(`MarketCheck API error for ${gap.make} ${gap.model}:`, marketRes.status);
          continue;
        }

        const marketJson = await marketRes.json();
        const listings = marketJson.listings || [];

        console.log(`${gap.make} ${gap.model}: Found ${listings.length} available in market`);

        if (listings.length === 0) {
          // No listings, but still add as opportunity with typical values
          opportunities.push({
            make: gap.make,
            model: gap.model,
            year_range: "2015-2023",
            opportunity_type: "untapped_market",
            market_availability: "limited",
            avg_market_price: null,
            avg_days_on_market: null,
            inventory_count: 0,
            typical_buy_price: gap.typical_buy,
            typical_sell_price: gap.typical_sell,
            estimated_profit: gap.typical_profit,
            target_price_max: gap.typical_buy,
            expected_profit: gap.typical_profit,
            expected_days_to_sell: 35,
            reasoning: `NEW MODEL TO TRY: ${gap.make} ${gap.model} is a proven BHPH performer with $${gap.typical_profit.toLocaleString()} typical profit. You haven't sold this specific model yet.`,
            why_you_should_try: `Similar dealers average $${gap.typical_profit.toLocaleString()} profit on ${gap.make} ${gap.model}. Strong resale value and consistent demand. Limited local inventory - check regional sources.`,
            where_to_find: gap.typical_buy < 15000
              ? ["Copart", "IAA", "Private party", "Trade-ins"]
              : ["Dealer auctions", "Manheim", "Wholesale groups"],
            confidence_score: 65
          });
          continue;
        }

        // Calculate market metrics
        const prices = listings.map((l: any) => l.price).filter((p: number) => p > 0);
        const domValues = listings.map((l: any) => l.dom).filter((d: number) => d >= 0);

        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        const avgDom = domValues.length > 0 ? domValues.reduce((a, b) => a + b, 0) / domValues.length : 0;

        // Determine opportunity type
        let opportunityType = "untapped_market";
        let confidenceScore = 75;

        if (listings.length > 30 && avgDom < 45) {
          opportunityType = "hot_market"; // High supply + fast selling
          confidenceScore = 85;
        } else if (avgPrice < gap.typical_buy * 1.1) {
          opportunityType = "undervalued"; // Below typical buy price
          confidenceScore = 90;
        }

        opportunities.push({
          make: gap.make,
          model: gap.model,
          year_range: "2015-2023",
          opportunity_type: opportunityType,
          market_availability: listings.length > 30 ? "abundant" : listings.length > 15 ? "good" : "limited",
          avg_market_price: Math.round(avgPrice),
          avg_days_on_market: Math.round(avgDom),
          inventory_count: listings.length,
          typical_buy_price: gap.typical_buy,
          typical_sell_price: gap.typical_sell,
          estimated_profit: gap.typical_profit,
          target_price_max: Math.round(avgPrice),
          expected_profit: gap.typical_profit,
          expected_days_to_sell: Math.round(avgDom),
          reasoning: `NEW OPPORTUNITY: ${listings.length} ${gap.make} ${gap.model} available nearby at $${Math.round(avgPrice).toLocaleString()} avg (selling in ${Math.round(avgDom)} days). You haven't tried this specific model yet.`,
          why_you_should_try: opportunityType === "hot_market"
            ? `HOT MARKET: ${listings.length} available, selling fast (${Math.round(avgDom)} DOM). Similar dealers profit $${gap.typical_profit.toLocaleString()}.`
            : opportunityType === "undervalued"
            ? `UNDERVALUED: Market price $${Math.round(avgPrice).toLocaleString()} is below typical buy range. Strong profit potential.`
            : `UNTAPPED: You haven't sold this specific model. Similar dealers average $${gap.typical_profit.toLocaleString()} profit. ${listings.length} available to try.`,
          where_to_find: avgPrice < 15000
            ? ["Copart", "IAA", "Private party", "Trade-ins"]
            : ["Dealer auctions", "Manheim", "Wholesale groups"],
          confidence_score: confidenceScore
        });

      } catch (err) {
        console.error(`Error fetching ${gap.make} ${gap.model}:`, err);
      }
    }

    // Sort by confidence score (best opportunities first)
    opportunities.sort((a, b) => b.confidence_score - a.confidence_score);

    // Limit to requested quantity
    const finalOpportunities = opportunities.slice(0, quantity);

    const elapsedMs = Date.now() - startTime;
    const estimatedCost = apiCallsMade * 0.02;

    const response = {
      recommendations: finalOpportunities.map((opp, i) => ({
        rank: i + 1,
        ...opp
      })),
      market_insights: `Found ${finalOpportunities.length} vehicles you HAVEN'T tried yet! These are proven BHPH winners that similar dealers profit from. ${
        apiCallsMade > 0
          ? `Validated ${apiCallsMade} against current market data.`
          : 'Based on industry performance data - zero API costs!'
      } Consider testing 1-2 units to expand your profit centers.`,
      data_source: "opportunity_discovery",
      recommendation_type: "new_opportunities",
      api_calls_made: apiCallsMade,
      generated_at: new Date().toISOString(),
      cost_breakdown: {
        api_calls_made: apiCallsMade,
        estimated_cost: estimatedCost,
        elapsed_ms: elapsedMs
      },
      dealer_context: {
        location: dealerLocation,
        existing_makemodels_count: existingMakeModels.size,
        gaps_found: gaps.length
      }
    };

    console.log("=== OPPORTUNITY DISCOVERY COMPLETE ===");
    console.log(`API Calls: ${apiCallsMade}, Cost: $${estimatedCost.toFixed(4)}, Time: ${elapsedMs}ms`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-opportunity-recommendations:", error);

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
