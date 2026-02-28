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

    const { dealer_id, vehicle } = await req.json();

    console.log("=== ANALYZE VEHICLE OPPORTUNITY ===");
    console.log(`Dealer ID: ${dealer_id}`);
    console.log(`Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);

    // STEP 1: Check cache for recent analysis (24hr TTL)
    const cacheKey = `${vehicle.vin || `${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.price}`}`;
    const { data: cached } = await supabase
      .from("vehicle_ai_analysis")
      .select("*")
      .eq("dealer_id", dealer_id)
      .eq("vin", vehicle.vin || null)
      .eq("make", vehicle.make)
      .eq("model", vehicle.model)
      .eq("price", vehicle.price || 0)
      .gte("analyzed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      console.log("Found cached analysis");
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STEP 2: Get dealer's historical preferences for this make/model
    const { data: dealerPrefs } = await supabase
      .from("dealer_vehicle_preferences")
      .select("*")
      .eq("dealer_id", dealer_id)
      .eq("make", vehicle.make)
      .eq("model", vehicle.model || null)
      .single();

    console.log(
      dealerPrefs
        ? `Found dealer history: avg profit $${dealerPrefs.avg_profit}, ${dealerPrefs.avg_days_on_lot} days on lot`
        : "No dealer history for this make/model"
    );

    // STEP 3: Build AI prompt with all context
    const prompt = `Analyze this vehicle opportunity for a used car dealer:

VEHICLE:
${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ""}
${vehicle.vin ? `VIN: ${vehicle.vin}` : ""}
Price: $${vehicle.price || "Unknown"}
${vehicle.mmr ? `MMR: $${vehicle.mmr} (${vehicle.savings_percentage || 0}% ${vehicle.savings_percentage > 0 ? "below" : "above"} market)` : ""}
Miles: ${vehicle.miles || "Unknown"}
${vehicle.exterior_color ? `Color: ${vehicle.exterior_color}` : ""}
${vehicle.location ? `Location: ${vehicle.location}` : ""}

${
  dealerPrefs
    ? `DEALER HISTORY (${vehicle.make} ${vehicle.model || ""}):
- Average Profit: $${Math.round(dealerPrefs.avg_profit || 0)}
- Average Days on Lot: ${dealerPrefs.avg_days_on_lot || "N/A"}
- Success Rate: ${Math.round((dealerPrefs.success_rate || 0) * 100)}% (${dealerPrefs.total_sold || 0} sold)
- Recent Sales: ${dealerPrefs.total_sold || 0} similar vehicles
- Avg Purchase Price: $${Math.round(dealerPrefs.avg_purchase_price || 0)}
- Avg Sale Price: $${Math.round(dealerPrefs.avg_sale_price || 0)}`
    : `DEALER HISTORY: No sales history for ${vehicle.make} ${vehicle.model || ""}`
}

${vehicle.savings_percentage && vehicle.mmr ? `MARKET POSITION: ${vehicle.savings_percentage}% ${vehicle.savings_percentage > 0 ? "below" : "above"} MMR of $${vehicle.mmr}` : ""}

Provide a detailed analysis in JSON format:
{
  "estimated_profit": <number: expected gross profit>,
  "estimated_recon_cost": <number: estimated reconditioning cost>,
  "estimated_days_to_sell": <number: expected days on lot>,
  "bhph_score": <1-10: suitability for BHPH financing>,
  "recommendation": "STRONG_BUY" | "BUY" | "MAYBE" | "PASS",
  "confidence_score": <0-100: confidence in recommendation>,
  "key_reasons": ["reason 1", "reason 2", "reason 3"],
  "risks": ["risk 1", "risk 2"],
  "target_purchase_price": <number: suggested max purchase price>,
  "target_sale_price": <number: suggested retail price>
}

Consider:
- Dealer's proven track record with this make/model
- Current market value vs asking price
- Likely reconditioning costs
- Time to sell based on dealer history
- BHPH suitability (reliable, financeable price point)
- Overall profit potential`;

    // STEP 4: Call Anthropic API with Claude Haiku (cost-effective)
    let aiAnalysis = null;

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errorText = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${errorText}`);
    }

    const anthropicData = await anthropicRes.json();
    const aiText = anthropicData.content?.[0]?.text || "{}";

    console.log("AI Response:", aiText);

    // STEP 5: Parse JSON response with fallback
    try {
      aiAnalysis = JSON.parse(aiText);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);

      // Create fallback analysis based on available data
      const savingsPercent = vehicle.savings_percentage || 0;
      const hasHistory = !!dealerPrefs;

      aiAnalysis = {
        estimated_profit: hasHistory
          ? dealerPrefs.avg_profit
          : vehicle.mmr && vehicle.price
          ? vehicle.mmr - vehicle.price - 1500
          : 2000,
        estimated_recon_cost: 1500,
        estimated_days_to_sell: hasHistory ? dealerPrefs.avg_days_on_lot : 30,
        bhph_score: vehicle.price && vehicle.price < 15000 ? 7 : 5,
        recommendation: savingsPercent >= 15 ? "BUY" : savingsPercent >= 10 ? "MAYBE" : "PASS",
        confidence_score: 60,
        key_reasons: [
          savingsPercent > 0 ? `${savingsPercent}% below market value` : "Market rate pricing",
          hasHistory ? `Dealer has sold ${dealerPrefs.total_sold} similar vehicles` : "New vehicle type for dealer",
        ],
        risks: ["AI analysis failed, using fallback estimates"],
        target_purchase_price: vehicle.price || 0,
        target_sale_price: vehicle.mmr || vehicle.price * 1.15 || 0,
      };
    }

    // STEP 6: Store analysis in database
    const { data: savedAnalysis, error: insertError } = await supabase
      .from("vehicle_ai_analysis")
      .insert({
        dealer_id,
        vin: vehicle.vin || null,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        price: vehicle.price || null,
        miles: vehicle.miles || null,
        estimated_profit: aiAnalysis.estimated_profit,
        estimated_recon_cost: aiAnalysis.estimated_recon_cost,
        estimated_days_to_sell: aiAnalysis.estimated_days_to_sell,
        bhph_score: aiAnalysis.bhph_score,
        recommendation: aiAnalysis.recommendation,
        confidence_score: aiAnalysis.confidence_score,
        key_reasons: aiAnalysis.key_reasons,
        risks: aiAnalysis.risks,
        target_purchase_price: aiAnalysis.target_purchase_price,
        target_sale_price: aiAnalysis.target_sale_price,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to save analysis:", insertError);
      // Still return the analysis even if save failed
      return new Response(JSON.stringify(aiAnalysis), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analysis saved. Recommendation: ${aiAnalysis.recommendation}`);

    return new Response(JSON.stringify(savedAnalysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-vehicle-opportunity:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
