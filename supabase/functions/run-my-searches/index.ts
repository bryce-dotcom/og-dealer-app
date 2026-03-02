import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("🚀 run-my-searches INVOKED - Method:", req.method);

  if (req.method === "OPTIONS") {
    console.log("OPTIONS request - returning CORS headers");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting search process...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const MARKETCHECK_API_KEY = Deno.env.get("MARKETCHECK_API_KEY");

    // Get dealer_id from request body
    console.log("Parsing request body...");
    const bodyText = await req.text();
    console.log("Request body:", bodyText);
    const body = JSON.parse(bodyText);
    const { dealer_id } = body;
    console.log("dealer_id from request:", dealer_id);

    if (!dealer_id) {
      return new Response(
        JSON.stringify({ success: false, error: "dealer_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`=== RUN SEARCHES FOR DEALER ${dealer_id} ===`);

    // Get active searches for THIS dealer only
    const { data: searches, error: searchError } = await supabase
      .from("saved_vehicle_searches")
      .select("*")
      .eq("dealer_id", dealer_id)
      .eq("active", true);

    if (searchError) throw searchError;

    console.log(`Found ${searches?.length || 0} active searches for dealer ${dealer_id}`);

    if (!searches || searches.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          searches_processed: 0,
          deals_found: 0,
          message: "No active searches found. Create a search first!",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalDealsFound = 0;
    let totalVehiclesFound = 0;
    let totalFiltered = 0;
    const searchDetails: any[] = [];

    for (const search of searches) {
      console.log(`\n=== PROCESSING SEARCH: ${search.name} ===`);
      console.log(`Criteria: ${search.year_min}-${search.year_max} ${search.make} ${search.model || 'any model'}`);
      console.log(`Max Price: $${search.max_price}, Max Miles: ${search.max_miles}`);

      try {
        // Split model by commas to support multiple models (e.g., "2500, 3500")
        const models = search.model
          ? search.model.split(',').map((m: string) => m.trim()).filter((m: string) => m)
          : [null];

        console.log(`Models to search: ${models.join(', ')}`);

        const allVehicles = [];

        // STEP 1: Find vehicles for each model
        for (const model of models) {
          console.log(`\n  → Calling find-vehicles for model: ${model || 'any'}`);

          const { data: vehiclesData, error: findError } = await supabase.functions.invoke(
            "find-vehicles",
            {
              body: {
                year_min: search.year_min,
                year_max: search.year_max,
                make: search.make,
                model: model,
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
            console.error(`  ✗ find-vehicles ERROR for model ${model}:`, JSON.stringify(findError));
            searchDetails.push({
              name: search.name,
              model: model,
              error: "find-vehicles failed",
              error_details: JSON.stringify(findError)
            });
            continue;
          }

          console.log(`  ✓ find-vehicles returned: ${vehiclesData?.dealer_listings?.length || 0} dealer + ${vehiclesData?.private_listings?.length || 0} private listings`);

          // DIAGNOSTIC: Track what find-vehicles returned INCLUDING LOGS
          if (!searchDetails.find(sd => sd.name === search.name)) {
            searchDetails.push({
              name: search.name,
              model: model,
              dealer_count: vehiclesData?.dealer_listings?.length || 0,
              private_count: vehiclesData?.private_listings?.length || 0,
              find_vehicles_logs: vehiclesData?.logs || []
            });
          }

          allVehicles.push(
            ...(vehiclesData.dealer_listings || []),
            ...(vehiclesData.private_listings || [])
          );
        }

        console.log(`Found ${allVehicles.length} total vehicles`);
        totalVehiclesFound += allVehicles.length;

        // STEP 2: Filter good deals (>1% below market - very permissive to catch any deals)
        const goodDeals = [];
        let skippedNoPrice = 0;
        let skippedNotGoodDeal = 0;

        for (const vehicle of allVehicles.slice(0, 50)) {
          // Skip if no price at all
          if (!vehicle.price) {
            skippedNoPrice++;
            continue;
          }

          // If we have price but no MMR, show it anyway (can't score it as a deal though)
          if (!vehicle.mmr) {
            goodDeals.push({
              ...vehicle,
              savings: null,
              savings_percentage: null,
              deal_score: "Unknown - No MMR",
            });
            continue;
          }

          // We have both price and MMR - score it
          const savings = vehicle.mmr - vehicle.price;
          const savingsPercent = (savings / vehicle.mmr) * 100;

          if (savingsPercent >= 1) {
            goodDeals.push({
              ...vehicle,
              savings,
              savings_percentage: Math.round(savingsPercent * 100) / 100,
              deal_score: savingsPercent >= 15 ? "Excellent" : savingsPercent >= 12 ? "Great" : savingsPercent >= 8 ? "Good" : "Fair",
            });
          } else {
            skippedNotGoodDeal++;
          }
        }

        console.log(`${goodDeals.length} deals passed filter (>5% below market)`);
        console.log(`Skipped: ${skippedNoPrice} no price, ${skippedNotGoodDeal} not good deals`);

        totalFiltered += skippedNotGoodDeal;

        searchDetails.push({
          name: search.name,
          vehicles_found: allVehicles.length,
          deals_passed_filter: goodDeals.length,
          skipped_no_price: skippedNoPrice,
          skipped_not_deal: skippedNotGoodDeal,
          sample_vehicles: allVehicles.slice(0, 3).map(v => ({
            year: v.year,
            make: v.make,
            model: v.model,
            price: v.price,
            mmr: v.mmr,
            miles: v.miles,
            source: v.source
          }))
        });

        // STEP 3: AI analysis for top deals
        for (const deal of goodDeals.slice(0, 10)) {
          try {
            let aiAnalysis: any = null;

            if (ANTHROPIC_API_KEY && search.bhph_preferred) {
              const prompt = `Analyze this vehicle for a Buy Here Pay Here dealer:

Vehicle: ${deal.year} ${deal.make} ${deal.model}
Price: $${deal.price}
Miles: ${deal.miles?.toLocaleString() || "Unknown"}
MMR (Market): $${deal.mmr}
Deal: ${deal.savings_percentage}% below market

Provide JSON with:
{
  "estimated_profit": <number>,
  "estimated_recon_cost": <number>,
  "estimated_holding_cost": <number>,
  "bhph_score": <1-10>,
  "recommendation": "BUY" | "MAYBE" | "PASS",
  "confidence_score": <0-100>,
  "key_reasons": ["reason1", "reason2"],
  "risks": ["risk1", "risk2"]
}`;

              const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": ANTHROPIC_API_KEY,
                  "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                  model: "claude-haiku-4-20250514",
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
                  aiAnalysis = {
                    recommendation: deal.savings_percentage >= 15 ? "BUY" : "MAYBE",
                    confidence_score: 70,
                    key_reasons: [`${deal.savings_percentage}% below market`],
                    risks: ["Needs inspection"],
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
              console.log(`Saved: ${deal.year} ${deal.make} ${deal.model}`);
            }
          } catch (aiError) {
            console.error(`AI analysis error:`, aiError);
          }
        }

        // Update last_run_at
        await supabase
          .from("saved_vehicle_searches")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", search.id);
      } catch (searchProcessError) {
        console.error(`Error processing search ${search.id}:`, searchProcessError);
      }
    }

    console.log(`\n=== COMPLETE: ${totalDealsFound} deals saved ===`);

    return new Response(
      JSON.stringify({
        success: true,
        searches_processed: searches?.length || 0,
        deals_found: totalDealsFound,
        total_vehicles_found: totalVehiclesFound,
        total_filtered_out: totalFiltered,
        search_details: searchDetails,
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
