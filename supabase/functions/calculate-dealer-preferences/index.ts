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

    console.log("=== CALCULATE DEALER PREFERENCES ===");

    const { dealer_id } = await req.json().catch(() => ({ dealer_id: null }));

    // Get all dealers or specific dealer
    const { data: dealers, error: dealerError } = await supabase
      .from("dealer_settings")
      .select("id, dealer_name")
      .eq(dealer_id ? "id" : "id", dealer_id || 0)
      .gte("id", dealer_id || 1); // If no dealer_id, get all

    if (dealerError) throw dealerError;

    console.log(`Processing ${dealers?.length || 0} dealers`);

    let totalPreferencesCalculated = 0;

    for (const dealer of dealers || []) {
      console.log(`\n--- Dealer: ${dealer.dealer_name} (ID: ${dealer.id}) ---`);

      try {
        // Query historical sales data
        const { data: inventory, error: invError } = await supabase
          .from("inventory")
          .select(`
            id,
            make,
            model,
            purchase_price,
            sale_price,
            profit,
            status,
            created_at
          `)
          .eq("dealer_id", dealer.id)
          .gte("created_at", new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()); // Last 2 years

        if (invError) {
          console.error(`Error fetching inventory:`, invError);
          continue;
        }

        console.log(`Found ${inventory?.length || 0} vehicles in last 2 years`);

        // Get deals to calculate days on lot
        const { data: deals, error: dealsError } = await supabase
          .from("deals")
          .select("vehicle_id, date_of_sale")
          .eq("dealer_id", dealer.id)
          .not("date_of_sale", "is", null);

        if (dealsError) {
          console.error(`Error fetching deals:`, dealsError);
          // Continue without deal data
        }

        // Create lookup for deal dates
        const dealDates = new Map();
        (deals || []).forEach((deal) => {
          dealDates.set(deal.vehicle_id, deal.date_of_sale);
        });

        // Group by make/model and calculate metrics
        const grouped = new Map();

        (inventory || []).forEach((vehicle) => {
          if (!vehicle.make) return;

          const key = `${vehicle.make}|${vehicle.model || ""}`;

          if (!grouped.has(key)) {
            grouped.set(key, {
              make: vehicle.make,
              model: vehicle.model || null,
              vehicles: [],
            });
          }

          grouped.get(key).vehicles.push(vehicle);
        });

        // Calculate preferences for each make/model
        const preferences = [];

        for (const [_, group] of grouped) {
          const vehicles = group.vehicles;

          // Need at least 3 vehicles to establish a pattern
          if (vehicles.length < 3) continue;

          const soldVehicles = vehicles.filter((v) => v.status === "Sold");
          const totalSold = soldVehicles.length;
          const successRate = totalSold / vehicles.length;

          // Calculate average days on lot
          let totalDaysOnLot = 0;
          let daysCount = 0;

          soldVehicles.forEach((v) => {
            const saleDate = dealDates.get(v.id);
            if (saleDate && v.created_at) {
              const days = Math.round(
                (new Date(saleDate).getTime() - new Date(v.created_at).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              if (days >= 0 && days < 365) {
                // Sanity check
                totalDaysOnLot += days;
                daysCount++;
              }
            }
          });

          const avgDaysOnLot = daysCount > 0 ? Math.round(totalDaysOnLot / daysCount) : null;

          // Calculate financial metrics
          const profitableVehicles = soldVehicles.filter((v) => v.profit != null);
          const avgProfit =
            profitableVehicles.length > 0
              ? profitableVehicles.reduce((sum, v) => sum + (v.profit || 0), 0) /
                profitableVehicles.length
              : null;

          const vehiclesWithPurchasePrice = vehicles.filter((v) => v.purchase_price != null);
          const avgPurchasePrice =
            vehiclesWithPurchasePrice.length > 0
              ? vehiclesWithPurchasePrice.reduce((sum, v) => sum + (v.purchase_price || 0), 0) /
                vehiclesWithPurchasePrice.length
              : null;

          const vehiclesWithSalePrice = soldVehicles.filter((v) => v.sale_price != null);
          const avgSalePrice =
            vehiclesWithSalePrice.length > 0
              ? vehiclesWithSalePrice.reduce((sum, v) => sum + (v.sale_price || 0), 0) /
                vehiclesWithSalePrice.length
              : null;

          preferences.push({
            dealer_id: dealer.id,
            make: group.make,
            model: group.model,
            avg_profit: avgProfit,
            avg_days_on_lot: avgDaysOnLot,
            total_sold: totalSold,
            success_rate: successRate,
            avg_purchase_price: avgPurchasePrice,
            avg_sale_price: avgSalePrice,
            last_calculated_at: new Date().toISOString(),
          });
        }

        console.log(`Calculated ${preferences.length} make/model preferences`);

        // Upsert preferences (insert or update)
        if (preferences.length > 0) {
          const { error: upsertError } = await supabase
            .from("dealer_vehicle_preferences")
            .upsert(preferences, {
              onConflict: "dealer_id,make,model",
            });

          if (upsertError) {
            console.error(`Error upserting preferences:`, upsertError);
          } else {
            totalPreferencesCalculated += preferences.length;
            console.log(`✓ Saved ${preferences.length} preferences`);

            // Show top 3 most profitable
            const top3 = preferences
              .filter((p) => p.avg_profit)
              .sort((a, b) => (b.avg_profit || 0) - (a.avg_profit || 0))
              .slice(0, 3);

            if (top3.length > 0) {
              console.log("\nTop profitable vehicles:");
              top3.forEach((p, i) => {
                console.log(
                  `  ${i + 1}. ${p.make} ${p.model || ""} - $${Math.round(p.avg_profit || 0)} avg profit, ${p.total_sold} sold`
                );
              });
            }
          }
        }
      } catch (dealerError) {
        console.error(`Error processing dealer ${dealer.id}:`, dealerError);
      }
    }

    console.log(`\n=== COMPLETE ===`);
    console.log(`Total preferences calculated: ${totalPreferencesCalculated}`);

    return new Response(
      JSON.stringify({
        success: true,
        dealers_processed: dealers?.length || 0,
        total_preferences: totalPreferencesCalculated,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in calculate-dealer-preferences:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
