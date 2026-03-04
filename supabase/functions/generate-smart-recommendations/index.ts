import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: Build reasoning from data (NO AI needed)
function buildReasoning(pref: any, seasonal: any, market: any): string {
  let reasoning = `You've sold ${pref.total_sold} ${pref.make} ${pref.model || ''} `;
  reasoning += `with $${Math.round(pref.avg_profit || 0).toLocaleString()} avg profit in ${pref.avg_days_on_lot || '?'} days. `;
  reasoning += `Success rate: ${((pref.success_rate || 0) * 100).toFixed(0)}%. `;

  if (seasonal?.best_buy_months?.length > 0) {
    const months = seasonal.best_buy_months.map((m: number) =>
      new Date(2000, m - 1).toLocaleString('default', { month: 'short' })
    );
    reasoning += `Best to buy in ${months.join(', ')}. `;
  }

  if (market?.avg_price) {
    reasoning += `Current market: ${market.inventory_count || '?'} available at $${market.avg_price.toLocaleString()} avg. `;
  }

  return reasoning;
}

// Helper: Build sourcing advice based on price point
function buildSourcingAdvice(avgPrice: number): string[] {
  if (avgPrice < 10000) {
    return ["Copart", "IAA", "Private party", "Trade-ins"];
  } else if (avgPrice < 20000) {
    return ["Dealer auctions", "Manheim", "Wholesale groups", "Trade-ins"];
  } else {
    return ["Dealer auctions", "Wholesale groups", "Off-lease programs"];
  }
}

// Helper: Calculate confidence score
function calculateConfidence(totalSold: number, successRate: number): number {
  // More sales + higher success rate = higher confidence
  const salesScore = Math.min(totalSold / 20, 1); // Cap at 20 sales = 100%
  const rateScore = successRate || 0;
  return Math.round((salesScore * 0.4 + rateScore * 0.6) * 100);
}

// Helper: Industry defaults (NO API calls)
function buildIndustryDefaults(quantity: number) {
  const defaults = [
    { make: "Honda", model: "Civic", buy: 12000, sell: 15500, profit: 2300, dom: 35 },
    { make: "Toyota", model: "Camry", buy: 13000, sell: 16500, profit: 2300, dom: 32 },
    { make: "Ford", model: "F-150", buy: 20000, sell: 25000, profit: 3500, dom: 28 },
    { make: "Honda", model: "Accord", buy: 11000, sell: 14500, profit: 2300, dom: 36 },
    { make: "Toyota", model: "RAV4", buy: 15000, sell: 19000, profit: 2800, dom: 30 },
    { make: "Nissan", model: "Altima", buy: 10000, sell: 13000, profit: 1900, dom: 38 },
    { make: "Chevrolet", model: "Silverado", buy: 22000, sell: 27000, profit: 3500, dom: 30 },
    { make: "Toyota", model: "Corolla", buy: 11000, sell: 14000, profit: 1900, dom: 34 },
    { make: "Jeep", model: "Wrangler", buy: 18000, sell: 23000, profit: 3500, dom: 25 },
    { make: "Honda", model: "CR-V", buy: 14000, sell: 18000, profit: 2700, dom: 32 }
  ];

  return {
    recommendations: defaults.slice(0, quantity).map((d, i) => ({
      rank: i + 1,
      make: d.make,
      model: d.model,
      year_range: "2015-2023",

      // No dealer history (new dealer)
      your_times_sold: null,
      your_avg_profit: null,
      your_avg_days_on_lot: null,
      your_success_rate: null,
      your_avg_purchase_price: null,
      your_avg_sale_price: null,
      times_sold: null,
      your_historical_profit: null,

      // No seasonal data
      seasonal_buy_months: null,
      seasonal_sell_months: null,

      // No market data
      current_market_price: null,
      current_market_dom: null,
      current_market_inventory: null,

      // Recommendations based on industry standards (using field names frontend expects)
      target_price_max: d.buy,
      target_buy_price: d.buy,
      target_sell_price: d.sell,
      expected_profit: d.profit,
      estimated_profit: d.profit,
      expected_days_to_sell: d.dom,
      estimated_days_to_sell: d.dom,
      estimated_recon: 1200,

      // Reasoning
      reasoning: `Industry default: ${d.make} ${d.model} is a proven BHPH performer with strong resale value and consistent demand.`,
      where_to_find: buildSourcingAdvice(d.buy),
      action_item: "Safe bet for new dealers - track your results for personalized recommendations",

      // Confidence
      confidence_source: "industry_default",
      confidence_score: 65
    })),
    data_source: "industry_defaults",
    api_calls_made: 0,
    cache_used: 0,
    market_insights: "⚠️ No sales history available. These are safe industry defaults based on proven BHPH performers. Start tracking your sales to get personalized recommendations based on YOUR actual performance.",
    tier: "fallback"
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=== ZERO-API RECOMMENDATIONS STARTED ===");
  console.log("Function invoked at:", new Date().toISOString());

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Supabase client created");

    let requestBody;
    try {
      requestBody = await req.json();
      console.log("Request body parsed:", requestBody);
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid JSON in request body",
        details: String(parseError)
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dealer_id, quantity = 10 } = requestBody;

    console.log(`Dealer ID: ${dealer_id}, Quantity: ${quantity}`);

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

    if (dealerError) {
      console.error("Error fetching dealer:", dealerError);
    }

    if (!dealer) {
      throw new Error(`Dealer ${dealer_id} not found`);
    }

    const dealerLocation = `${dealer?.city || "Unknown"}, ${dealer?.state || "UT"}`;
    console.log(`Dealer: ${dealer?.dealer_name}, Location: ${dealerLocation}`);

    // STEP 1: Query dealer's proven winners (ONE database query)
    console.log("Step 1: Querying dealer_vehicle_preferences...");
    const { data: dealerPrefs, error: prefsError } = await supabase
      .from("dealer_vehicle_preferences")
      .select("*")
      .eq("dealer_id", dealer_id)
      .gte("total_sold", 2) // At least 2 sales to be "proven"
      .order("avg_profit", { ascending: false })
      .limit(quantity);

    if (prefsError) {
      console.error("Error fetching dealer preferences:", prefsError);
    }

    console.log(`Found ${dealerPrefs?.length || 0} proven makes in dealer history`);

    // If no dealer history, return industry defaults immediately
    if (!dealerPrefs || dealerPrefs.length === 0) {
      console.log("⚠️ No sales history - returning industry defaults");
      const elapsedMs = Date.now() - startTime;
      const response = {
        ...buildIndustryDefaults(quantity),
        cost_breakdown: {
          api_calls_made: 0,
          cache_hits: 0,
          estimated_cost: 0,
          elapsed_ms: elapsedMs
        },
        dealer_context: {
          location: dealerLocation,
          proven_makes_count: 0,
          has_seasonal_data: false
        }
      };

      console.log(`=== ZERO-API COMPLETE === Time: ${elapsedMs}ms, Cost: $0.00`);

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 2: Query seasonal patterns (ONE database query)
    console.log("Step 2: Querying seasonal_vehicle_patterns...");
    const { data: seasonal, error: seasonalError } = await supabase
      .from("seasonal_vehicle_patterns")
      .select("*")
      .eq("dealer_id", dealer_id);

    if (seasonalError) {
      console.error("Error fetching seasonal patterns:", seasonalError);
    }

    console.log(`Found ${seasonal?.length || 0} seasonal patterns`);

    // Create lookup map for seasonal data
    const seasonalMap = new Map(
      seasonal?.map(s => [`${s.make}_${s.model || s.make}`, s]) || []
    );

    // STEP 3: Query cached market data if available (ONE database query, OPTIONAL)
    console.log("Step 3: Querying market_intelligence_cache...");
    const { data: marketCache, error: cacheError } = await supabase
      .from("market_intelligence_cache")
      .select("*")
      .eq("dealer_id", dealer_id)
      .gte("expires_at", new Date().toISOString()); // Only non-expired

    if (cacheError) {
      console.error("Error fetching market cache:", cacheError);
    }

    console.log(`Found ${marketCache?.length || 0} cached market insights (non-expired)`);

    // Create lookup map for market cache
    const marketMap = new Map(
      marketCache?.map(m => [`${m.make}_${m.model || m.make}`, m.insights]) || []
    );

    // STEP 4: Build recommendations using ONLY database data (pure logic, NO API)
    console.log("Step 4: Building recommendations from database data...");

    const recommendations = dealerPrefs.map((pref, index) => {
      const seasonalData = seasonalMap.get(`${pref.make}_${pref.model || pref.make}`);
      const marketData = marketMap.get(`${pref.make}_${pref.model || pref.make}`);

      const targetBuyPrice = Math.round((pref.avg_purchase_price || 15000) * 0.95);
      const targetSellPrice = Math.round(pref.avg_sale_price || 18000);
      const estimatedProfit = Math.round(pref.avg_profit || 0);

      // Convert best_buy_months to month names for frontend
      const seasonalBuyMonths = seasonalData?.best_buy_months?.map((m: number) =>
        new Date(2000, m - 1).toLocaleString('default', { month: 'short' })
      ) || null;
      const seasonalSellMonths = seasonalData?.best_sell_months?.map((m: number) =>
        new Date(2000, m - 1).toLocaleString('default', { month: 'short' })
      ) || null;

      return {
        rank: index + 1,
        make: pref.make,
        model: pref.model,
        year_range: "2015-2023", // Reasonable default

        // Historical performance (from dealer_vehicle_preferences)
        your_times_sold: pref.total_sold,
        your_avg_profit: Math.round(pref.avg_profit || 0),
        your_avg_days_on_lot: pref.avg_days_on_lot,
        your_success_rate: pref.success_rate,
        your_avg_purchase_price: Math.round(pref.avg_purchase_price || 0),
        your_avg_sale_price: Math.round(pref.avg_sale_price || 0),

        // Seasonal intelligence (from seasonal_vehicle_patterns) - converted to month names
        seasonal_buy_months: seasonalBuyMonths,
        seasonal_sell_months: seasonalSellMonths,

        // Current market (from market_intelligence_cache - 24h old, already paid for)
        current_market_price: marketData?.avg_price || null,
        current_market_dom: marketData?.avg_dom || null,
        current_market_inventory: marketData?.inventory_count || null,

        // Recommendation (frontend expects these field names)
        target_price_max: targetBuyPrice,
        target_buy_price: targetBuyPrice, // Also keep this for compatibility
        target_sell_price: targetSellPrice,
        expected_profit: estimatedProfit,
        estimated_profit: estimatedProfit, // Also keep this for compatibility
        expected_days_to_sell: pref.avg_days_on_lot,
        estimated_days_to_sell: pref.avg_days_on_lot, // Also keep this for compatibility
        estimated_recon: pref.avg_purchase_price < 15000 ? 1000 : 1500,

        // Reasoning (data-driven, NO AI needed)
        reasoning: buildReasoning(pref, seasonalData, marketData),

        // Sourcing advice (based on price point, NO AI needed)
        where_to_find: buildSourcingAdvice(pref.avg_purchase_price || 15000),

        // Action item
        action_item: `Target ${pref.make} ${pref.model || ''} units similar to your proven winners. Buy around $${targetBuyPrice.toLocaleString()}, sell around $${targetSellPrice.toLocaleString()}.`,

        // Confidence
        confidence_source: "dealer_history",
        confidence_score: calculateConfidence(pref.total_sold, pref.success_rate || 0),

        // Additional fields for compatibility
        times_sold: pref.total_sold,
        your_historical_profit: Math.round(pref.avg_profit || 0)
      };
    });

    // Build market insights from data
    const avgProfit = Math.round(
      dealerPrefs.reduce((sum, p) => sum + (p.avg_profit || 0), 0) / dealerPrefs.length
    );
    const avgDaysOnLot = Math.round(
      dealerPrefs.reduce((sum, p) => sum + (p.avg_days_on_lot || 0), 0) / dealerPrefs.length
    );
    const totalSold = dealerPrefs.reduce((sum, p) => sum + (p.total_sold || 0), 0);

    const marketInsights = `Your proven winners: ${dealerPrefs.length} makes/models with ${totalSold} total sales. Average profit: $${avgProfit.toLocaleString()}, average days on lot: ${avgDaysOnLot}. ${
      seasonal && seasonal.length > 0
        ? `Seasonal timing data available for ${seasonal.length} makes.`
        : 'Consider tracking seasonal patterns for better timing.'
    } ${
      marketCache && marketCache.length > 0
        ? `Current market data cached for ${marketCache.length} makes.`
        : ''
    }`;

    const elapsedMs = Date.now() - startTime;

    const response = {
      recommendations,
      market_insights: marketInsights,
      data_source: "dealer_history",
      tier: "internal",
      api_calls_made: 0,
      cache_used: marketCache?.length || 0,
      generated_at: new Date().toISOString(),
      cost_breakdown: {
        api_calls_made: 0,
        cache_hits: marketCache?.length || 0,
        estimated_cost: 0.00,
        elapsed_ms: elapsedMs
      },
      dealer_context: {
        location: dealerLocation,
        proven_makes_count: dealerPrefs?.length || 0,
        has_seasonal_data: (seasonal?.length || 0) > 0
      }
    };

    console.log("=== ZERO-API RECOMMENDATIONS COMPLETE ===");
    console.log(`API Calls: 0, Cache Used: ${marketCache?.length || 0}, Cost: $0.00, Time: ${elapsedMs}ms`);

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
