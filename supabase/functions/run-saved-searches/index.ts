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

    console.log("=== RUN SAVED SEARCHES ===");

    // Get all active saved searches
    const { data: searches, error: searchError } = await supabase
      .from("saved_vehicle_searches")
      .select("*")
      .eq("active", true);

    if (searchError) throw searchError;

    console.log(`Found ${searches?.length || 0} active searches`);

    let totalDealsFound = 0;

    for (const search of searches || []) {
      console.log(`\n--- Processing search: ${search.name} (dealer ${search.dealer_id}) ---`);

      try {
        // STEP 1: Call existing find-vehicles function
        const { data: vehiclesData, error: findError } = await supabase.functions.invoke(
          "find-vehicles",
          {
            body: {
              year_min: search.year_min,
              year_max: search.year_max,
              make: search.make,
              model: search.model,
              trim: search.trim,
              engine_type: search.engine_type,
              drivetrain: search.drivetrain,
              transmission: search.transmission,
              body_type: search.body_type,
              cab_type: search.cab_type,
              bed_length: search.bed_length,
              max_price: search.max_price,
              max_miles: search.max_miles,
              zip_code: search.zip_code || "84065",
              radius_miles: search.radius_miles || 250,
            },
          }
        );

        if (findError) {
          console.error(`find-vehicles error:`, findError);
          continue;
        }

        const allVehicles = [
          ...(vehiclesData.dealer_listings || []),
          ...(vehiclesData.private_listings || []),
        ];

        console.log(`Found ${allVehicles.length} total vehicles`);

        // STEP 2: Get MMR values and filter good deals
        const goodDeals = [];

        for (const vehicle of allVehicles.slice(0, 50)) {
          // Limit to 50 to avoid rate limits
          try {
            // Get MMR from MarketCheck
            if (MARKETCHECK_API_KEY && vehicle.year && vehicle.make && vehicle.model) {
              const predParams = new URLSearchParams({
                api_key: MARKETCHECK_API_KEY,
                car_type: "used",
                year: String(vehicle.year),
                make: vehicle.make.toLowerCase(),
                model: vehicle.model,
                miles: String(vehicle.miles || 60000),
              });

              if (vehicle.trim) predParams.set("trim", vehicle.trim);

              const predUrl = `https://mc-api.marketcheck.com/v2/predict/car/price?${predParams.toString()}`;
              const predRes = await fetch(predUrl);

              if (predRes.ok) {
                const predData = await predRes.json();
                const mmr =
                  predData.predicted_price ||
                  predData.price ||
                  predData.adjusted_price ||
                  predData.mmr;

                if (mmr && vehicle.price) {
                  const savings = mmr - vehicle.price;
                  const savingsPercent = (savings / mmr) * 100;

                  // Filter: Only deals 10%+ below MMR
                  if (savingsPercent >= 10) {
                    goodDeals.push({
                      ...vehicle,
                      mmr,
                      market_value: predData.retail_price || mmr,
                      trade_in_value: predData.trade_in_price,
                      wholesale_value: predData.wholesale_price,
                      savings: Math.round(savings),
                      savings_percentage: Math.round(savingsPercent * 10) / 10,
                      deal_score:
                        savingsPercent >= 20
                          ? "GREAT DEAL"
                          : savingsPercent >= 15
                          ? "GOOD DEAL"
                          : "FAIR PRICE",
                    });

                    console.log(
                      `Good deal: ${vehicle.year} ${vehicle.make} ${vehicle.model} - $${vehicle.price} (${savingsPercent.toFixed(1)}% below MMR)`
                    );
                  }
                }
              }
            }
          } catch (mmrError) {
            console.error(`MMR error for vehicle:`, mmrError.message);
          }
        }

        console.log(`Filtered to ${goodDeals.length} good deals (10%+ below MMR)`);

        // STEP 3: AI analyze top deals (only top 10 to save costs)
        const topDeals = goodDeals.slice(0, 10);

        for (const deal of topDeals) {
          try {
            // Get dealer context for AI analysis
            const { data: dealerData } = await supabase
              .from("dealer_settings")
              .select("*")
              .eq("id", search.dealer_id)
              .single();

            // AI Analysis with Haiku (cheap and fast)
            let aiAnalysis = null;

            if (ANTHROPIC_API_KEY) {
              const prompt = `Analyze this vehicle deal for a used car dealer:

Vehicle: ${deal.year} ${deal.make} ${deal.model} ${deal.trim || ""}
Price: $${deal.price}
MMR Value: $${deal.mmr}
Savings: $${deal.savings} (${deal.savings_percentage}% below market)
Miles: ${deal.miles || "Unknown"}
Source: ${deal.source} (${deal.seller_type || "Unknown"})
Location: ${deal.location}

Dealer preferences:
- BHPH preferred: ${search.bhph_preferred ? "Yes" : "No"}
- Target market: ${dealerData?.state || "Utah"}

Provide analysis in JSON format:
{
  "estimated_profit": <number>,
  "estimated_recon_cost": <number>,
  "estimated_holding_cost": <number>,
  "bhph_score": <1-10>,
  "recommendation": "STRONG BUY" | "BUY" | "MAYBE" | "PASS",
  "confidence_score": <0-100>,
  "key_reasons": ["reason 1", "reason 2", "reason 3"],
  "risks": ["risk 1", "risk 2"]
}`;

              const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": ANTHROPIC_API_KEY,
                  "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                  model: "claude-3-haiku-20240307",
                  max_tokens: 500,
                  messages: [{ role: "user", content: prompt }],
                }),
              });

              if (anthropicRes.ok) {
                const anthropicData = await anthropicRes.json();
                const aiText = anthropicData.content?.[0]?.text || "{}";
                try {
                  aiAnalysis = JSON.parse(aiText);
                } catch {
                  // AI didn't return valid JSON, create default
                  aiAnalysis = {
                    recommendation: deal.savings_percentage >= 15 ? "BUY" : "MAYBE",
                    confidence_score: 70,
                    key_reasons: [`${deal.savings_percentage}% below market`],
                    risks: ["Needs manual inspection"],
                  };
                }
              }
            }

            // STEP 4: Save to deal_alerts
            const { error: insertError } = await supabase.from("deal_alerts").insert({
              dealer_id: search.dealer_id,
              search_id: search.id,
              year: deal.year,
              make: deal.make,
              model: deal.model,
              trim: deal.trim,
              vin: deal.vin,
              price: deal.price,
              miles: deal.miles,
              location: deal.location,
              url: deal.url,
              source: deal.source,
              exterior_color: deal.exterior_color,
              seller_type: deal.seller_type || deal.source,
              dealer_name: deal.dealer_name,
              thumbnail: deal.thumbnail || deal.primary_photo_url,
              mmr: deal.mmr,
              market_value: deal.market_value,
              trade_in_value: deal.trade_in_value,
              wholesale_value: deal.wholesale_value,
              deal_score: deal.deal_score,
              savings: deal.savings,
              savings_percentage: deal.savings_percentage,
              estimated_profit: aiAnalysis?.estimated_profit,
              estimated_recon_cost: aiAnalysis?.estimated_recon_cost,
              estimated_holding_cost: aiAnalysis?.estimated_holding_cost,
              bhph_score: aiAnalysis?.bhph_score,
              recommendation: aiAnalysis?.recommendation,
              confidence_score: aiAnalysis?.confidence_score,
              ai_reasoning: aiAnalysis
                ? {
                    key_reasons: aiAnalysis.key_reasons,
                    risks: aiAnalysis.risks,
                  }
                : null,
              status: "new",
            });

            if (insertError) {
              console.error(`Insert error:`, insertError);
            } else {
              totalDealsFound++;
              console.log(
                `Saved deal alert: ${deal.year} ${deal.make} ${deal.model} - ${aiAnalysis?.recommendation || "N/A"}`
              );
            }
          } catch (aiError) {
            console.error(`AI analysis error:`, aiError.message);
          }
        }

        // Update last_run_at
        await supabase
          .from("saved_vehicle_searches")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", search.id);
      } catch (searchProcessError) {
        console.error(`Error processing search ${search.id}:`, searchProcessError.message);
      }
    }

    console.log(`\n=== COMPLETE: ${totalDealsFound} total deals saved ===`);

    return new Response(
      JSON.stringify({
        success: true,
        searches_processed: searches?.length || 0,
        deals_found: totalDealsFound,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
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
