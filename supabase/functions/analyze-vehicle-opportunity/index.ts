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

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { dealer_id, vehicle } = await req.json();

    if (!dealer_id || !vehicle) {
      return new Response(
        JSON.stringify({ success: false, error: "dealer_id and vehicle are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing vehicle for dealer ${dealer_id}:`, vehicle);

    // Check cache first (24 hour TTL)
    if (vehicle.vin) {
      const { data: cached } = await supabase
        .from("vehicle_ai_analysis")
        .select("*")
        .eq("dealer_id", dealer_id)
        .eq("vin", vehicle.vin)
        .gte("analyzed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        console.log("Cache hit! Returning cached analysis");
        return new Response(
          JSON.stringify({ success: true, cached: true, analysis: cached }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get dealer's historical preferences for this make/model
    const { data: dealerPrefs } = await supabase
      .from("dealer_vehicle_preferences")
      .select("*")
      .eq("dealer_id", dealer_id)
      .eq("make", vehicle.make)
      .eq("model", vehicle.model)
      .single();

    // Build AI prompt with vehicle data + dealer context
    let dealerContext = "";
    if (dealerPrefs) {
      dealerContext = `
DEALER HISTORY (${vehicle.make} ${vehicle.model}):
- Average Profit: $${dealerPrefs.avg_profit?.toLocaleString() || "Unknown"}
- Average Days on Lot: ${dealerPrefs.avg_days_on_lot || "Unknown"}
- Success Rate: ${dealerPrefs.success_rate ? (dealerPrefs.success_rate * 100).toFixed(0) + "%" : "Unknown"} (${dealerPrefs.total_sold || 0} sold)
- Typical Purchase: $${dealerPrefs.avg_purchase_price?.toLocaleString() || "Unknown"}
- Typical Sale: $${dealerPrefs.avg_sale_price?.toLocaleString() || "Unknown"}`;
    } else {
      dealerContext = `
DEALER HISTORY: No prior sales of ${vehicle.make} ${vehicle.model}`;
    }

    const prompt = `Analyze this vehicle opportunity for a Buy Here Pay Here dealer:

VEHICLE:
${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ""}
Price: $${vehicle.price?.toLocaleString() || "Unknown"}
Miles: ${vehicle.miles?.toLocaleString() || "Unknown"}
${vehicle.mmr ? `MMR (Market Value): $${vehicle.mmr.toLocaleString()}` : ""}
${vehicle.savings_percentage ? `Deal: ${vehicle.savings_percentage}% below market` : ""}
${vehicle.exterior_color ? `Color: ${vehicle.exterior_color}` : ""}
${vehicle.location ? `Location: ${vehicle.location}` : ""}
${dealerContext}

Provide a JSON analysis for a BHPH dealer focused on vehicles $8k-$35k that finance well:

{
  "estimated_profit": <number - expected gross profit after recon and sale>,
  "estimated_recon_cost": <number - typical reconditioning costs>,
  "estimated_days_to_sell": <number - expected days on lot>,
  "bhph_score": <1-10 - financing suitability: popular models, reliable brands, good payment range>,
  "recommendation": "STRONG_BUY" | "BUY" | "MAYBE" | "PASS",
  "confidence_score": <0-100 - confidence in this analysis>,
  "key_reasons": ["reason 1", "reason 2", "reason 3"],
  "risks": ["risk 1", "risk 2"],
  "target_purchase_price": <number - max you should pay>,
  "target_sale_price": <number - recommended retail price>
}

Consider: BHPH customers need affordable payments, reliable transportation, and popular models. High miles OK if reliable brand. Avoid luxury, exotic, or hard-to-finance vehicles.`;

    console.log("Calling Anthropic API...");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errorText = await anthropicRes.text();
      console.error("Anthropic API error:", errorText);
      throw new Error(`Anthropic API error: ${anthropicRes.status}`);
    }

    const anthropicData = await anthropicRes.json();
    const aiText = anthropicData.content?.[0]?.text || "{}";
    console.log("AI Response:", aiText);

    let analysis;
    try {
      analysis = JSON.parse(aiText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback analysis
      analysis = {
        estimated_profit: vehicle.savings || 2000,
        estimated_recon_cost: 1500,
        estimated_days_to_sell: 30,
        bhph_score: 5,
        recommendation: vehicle.savings_percentage >= 15 ? "BUY" : "MAYBE",
        confidence_score: 50,
        key_reasons: [
          vehicle.savings_percentage ? `${vehicle.savings_percentage}% below market` : "Price unknown",
          "AI analysis partially failed - manual review recommended"
        ],
        risks: ["AI parsing error - verify details manually"],
        target_purchase_price: vehicle.price || 0,
        target_sale_price: (vehicle.price || 0) + 3000,
      };
    }

    // Save to database for caching
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("vehicle_ai_analysis")
      .insert({
        dealer_id,
        vin: vehicle.vin,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        price: vehicle.price,
        miles: vehicle.miles,
        estimated_profit: analysis.estimated_profit,
        estimated_recon_cost: analysis.estimated_recon_cost,
        estimated_days_to_sell: analysis.estimated_days_to_sell,
        bhph_score: analysis.bhph_score,
        recommendation: analysis.recommendation,
        confidence_score: analysis.confidence_score,
        key_reasons: analysis.key_reasons,
        risks: analysis.risks,
        target_purchase_price: analysis.target_purchase_price,
        target_sale_price: analysis.target_sale_price,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving analysis:", saveError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        analysis: savedAnalysis || analysis,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
