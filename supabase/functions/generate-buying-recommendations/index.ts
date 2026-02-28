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

    const { dealer_id, budget_max, quantity } = await req.json();

    console.log("=== GENERATE BUYING RECOMMENDATIONS ===");
    console.log(`Dealer ID: ${dealer_id}`);
    console.log(`Budget: ${budget_max ? "$" + budget_max : "No limit"}`);
    console.log(`Quantity: ${quantity || 5}`);

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // STEP 1: Get dealer's historical preferences
    const { data: preferences, error: prefError } = await supabase
      .from("dealer_vehicle_preferences")
      .select("*")
      .eq("dealer_id", dealer_id)
      .gte("total_sold", 3) // Only include vehicles with meaningful sales history
      .order("avg_profit", { ascending: false });

    if (prefError) throw prefError;

    console.log(`Found ${preferences?.length || 0} vehicle preferences`);

    if (!preferences || preferences.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No sales history available. Sell at least 3 vehicles of a make/model to get recommendations.",
          recommendations: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // STEP 2: Get current month for seasonal context
    const currentMonth = new Date().toLocaleString("default", { month: "long" });
    const currentSeason = getSeason(new Date().getMonth() + 1);

    // STEP 3: Build AI prompt with dealer's history
    const topVehicles = preferences.slice(0, 10); // Top 10 by profit

    const historyText = topVehicles
      .map(
        (p) =>
          `- ${p.make} ${p.model || ""}: ${p.total_sold} sold, $${Math.round(p.avg_profit || 0)} avg profit, ${p.avg_days_on_lot || "?"} days avg, ${Math.round((p.success_rate || 0) * 100)}% success rate`
      )
      .join("\n");

    const prompt = `You are a vehicle acquisition expert helping a used car dealer decide what to buy next.

Based on their sales history and current market conditions, recommend the TOP ${quantity || 5} vehicles they should actively look for:

DEALER SUCCESS HISTORY (last 2 years):
${historyText}

CURRENT CONTEXT:
- Current month: ${currentMonth} (${currentSeason} season)
- Budget: ${budget_max ? "Up to $" + budget_max.toLocaleString() : "No limit"}
- Market: Used vehicle market

INSTRUCTIONS:
1. Prioritize vehicles with proven profit history for this dealer
2. Consider seasonal demand (e.g., trucks in summer, SUVs before winter)
3. Suggest realistic year ranges (avoid vehicles that are too old or too new)
4. Stay within budget if specified
5. Include WHERE to find these vehicles (auctions, private party, trade-ins, etc.)

Provide recommendations in JSON format:
{
  "recommendations": [
    {
      "rank": 1,
      "make": "Ford",
      "model": "F-150",
      "year_range": "2018-2022",
      "target_price_max": 35000,
      "expected_profit": 4500,
      "expected_days_to_sell": 21,
      "reasoning": "Strong profit history ($4,200 avg), fast seller (23 days), high demand in your market",
      "where_to_find": ["Dealer auctions (Manheim, ADESA)", "Private party listings", "Trade-ins"],
      "seasonal_note": "High demand right now"
    }
  ],
  "market_insights": "Brief overall market analysis and buying strategy for this dealer"
}

Return ONLY valid JSON, no other text.`;

    // STEP 4: Call Anthropic API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 2000,
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
    let recommendations;
    try {
      recommendations = JSON.parse(aiText);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);

      // Create fallback recommendations from top preferences
      recommendations = {
        recommendations: topVehicles.slice(0, quantity || 5).map((p, i) => ({
          rank: i + 1,
          make: p.make,
          model: p.model || "",
          year_range: getCurrentYearRange(),
          target_price_max: Math.round((p.avg_purchase_price || 20000) * 1.1),
          expected_profit: Math.round(p.avg_profit || 0),
          expected_days_to_sell: p.avg_days_on_lot || 30,
          reasoning: `Proven performer: ${p.total_sold} sold with $${Math.round(p.avg_profit || 0)} avg profit`,
          where_to_find: ["Dealer auctions", "Private party", "Trade-ins"],
          seasonal_note: "",
        })),
        market_insights: "AI analysis failed, showing recommendations based on your historical data.",
      };
    }

    console.log(`Generated ${recommendations.recommendations?.length || 0} recommendations`);

    return new Response(JSON.stringify(recommendations), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-buying-recommendations:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper functions
function getSeason(month: number): string {
  if (month >= 3 && month <= 5) return "Spring";
  if (month >= 6 && month <= 8) return "Summer";
  if (month >= 9 && month <= 11) return "Fall";
  return "Winter";
}

function getCurrentYearRange(): string {
  const currentYear = new Date().getFullYear();
  return `${currentYear - 6}-${currentYear - 2}`;
}
