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

    console.log("=== CALCULATE SEASONAL PATTERNS ===");

    const { dealer_id } = await req.json().catch(() => ({ dealer_id: null }));

    // Get all dealers or specific dealer
    const { data: dealers, error: dealerError } = await supabase
      .from("dealer_settings")
      .select("id, dealer_name")
      .eq(dealer_id ? "id" : "id", dealer_id || 0)
      .gte("id", dealer_id || 1);

    if (dealerError) throw dealerError;

    console.log(`Processing ${dealers?.length || 0} dealers`);

    let totalPatternsCalculated = 0;

    for (const dealer of dealers || []) {
      console.log(`\n--- Dealer: ${dealer.dealer_name} (ID: ${dealer.id}) ---`);

      try {
        // Query inventory with sale dates from deals
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
          .gte("created_at", new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString()); // Last 3 years

        if (invError) {
          console.error(`Error fetching inventory:`, invError);
          continue;
        }

        console.log(`Found ${inventory?.length || 0} vehicles in last 3 years`);

        // Get deals with sale dates
        const { data: deals, error: dealsError } = await supabase
          .from("deals")
          .select("vehicle_id, date_of_sale")
          .eq("dealer_id", dealer.id)
          .not("date_of_sale", "is", null);

        if (dealsError) {
          console.error(`Error fetching deals:`, dealsError);
        }

        // Create lookup for sale dates
        const saleDates = new Map();
        (deals || []).forEach((deal) => {
          saleDates.set(deal.vehicle_id, deal.date_of_sale);
        });

        // Group by make/model
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

        // Calculate seasonal patterns for each make/model
        const patterns = [];

        for (const [_, group] of grouped) {
          const vehicles = group.vehicles;

          // Need at least 12 vehicles over 3 years to identify seasonal patterns
          if (vehicles.length < 12) continue;

          // Track metrics by month (1-12)
          const salesByMonth = new Array(12).fill(0);
          const profitByMonth = new Array(12).fill(0).map(() => []);
          const priceByMonth = new Array(12).fill(0).map(() => []);
          const purchasesByMonth = new Array(12).fill(0);

          vehicles.forEach((v) => {
            // Track purchases (created_at)
            if (v.created_at) {
              const purchaseMonth = new Date(v.created_at).getMonth(); // 0-11
              purchasesByMonth[purchaseMonth]++;

              if (v.purchase_price) {
                priceByMonth[purchaseMonth].push(v.purchase_price);
              }
            }

            // Track sales (date_of_sale from deals)
            const saleDate = saleDates.get(v.id);
            if (saleDate && v.status === "Sold") {
              const saleMonth = new Date(saleDate).getMonth(); // 0-11
              salesByMonth[saleMonth]++;

              if (v.profit) {
                profitByMonth[saleMonth].push(v.profit);
              }
            }
          });

          // Calculate averages by month
          const avgPriceByMonth: Record<string, number> = {};
          const avgProfitByMonth: Record<string, number> = {};
          const salesCountByMonth: Record<string, number> = {};
          const demandScoreByMonth: Record<string, number> = {};

          for (let i = 0; i < 12; i++) {
            const monthNum = i + 1; // 1-12

            // Average purchase price
            if (priceByMonth[i].length > 0) {
              avgPriceByMonth[monthNum] = Math.round(
                priceByMonth[i].reduce((sum, p) => sum + p, 0) / priceByMonth[i].length
              );
            }

            // Average profit
            if (profitByMonth[i].length > 0) {
              avgProfitByMonth[monthNum] = Math.round(
                profitByMonth[i].reduce((sum, p) => sum + p, 0) / profitByMonth[i].length
              );
            }

            // Sales count
            salesCountByMonth[monthNum] = salesByMonth[i];

            // Demand score (1-10) based on sales velocity
            const avgSales = salesByMonth.reduce((sum, s) => sum + s, 0) / 12;
            const demandScore = avgSales > 0 ? Math.min(10, Math.max(1, Math.round((salesByMonth[i] / avgSales) * 5))) : 5;
            demandScoreByMonth[monthNum] = demandScore;
          }

          // Identify best months to buy (low prices) and sell (high sales)
          const monthsWithPrices = Object.entries(avgPriceByMonth)
            .map(([month, price]) => ({ month: parseInt(month), price }))
            .sort((a, b) => a.price - b.price);

          const bestBuyMonths = monthsWithPrices.slice(0, 3).map((m) => m.month);

          const monthsWithSales = Object.entries(salesCountByMonth)
            .map(([month, sales]) => ({ month: parseInt(month), sales }))
            .sort((a, b) => b.sales - a.sales);

          const bestSellMonths = monthsWithSales.slice(0, 3).map((m) => m.month);

          patterns.push({
            dealer_id: dealer.id,
            make: group.make,
            model: group.model,
            best_buy_months: bestBuyMonths,
            best_sell_months: bestSellMonths,
            avg_price_by_month: avgPriceByMonth,
            demand_score_by_month: demandScoreByMonth,
            sales_by_month: salesCountByMonth,
            profit_by_month: avgProfitByMonth,
            last_calculated_at: new Date().toISOString(),
          });
        }

        console.log(`Calculated ${patterns.length} seasonal patterns`);

        // Upsert patterns
        if (patterns.length > 0) {
          const { error: upsertError } = await supabase
            .from("seasonal_vehicle_patterns")
            .upsert(patterns, {
              onConflict: "dealer_id,make,model",
            });

          if (upsertError) {
            console.error(`Error upserting patterns:`, upsertError);
          } else {
            totalPatternsCalculated += patterns.length;
            console.log(`✓ Saved ${patterns.length} seasonal patterns`);

            // Show sample
            if (patterns.length > 0) {
              const sample = patterns[0];
              console.log(`\nSample: ${sample.make} ${sample.model || ""}`);
              console.log(`  Best buy months: ${getMonthNames(sample.best_buy_months)}`);
              console.log(`  Best sell months: ${getMonthNames(sample.best_sell_months)}`);
            }
          }
        }
      } catch (dealerError) {
        console.error(`Error processing dealer ${dealer.id}:`, dealerError);
      }
    }

    console.log(`\n=== COMPLETE ===`);
    console.log(`Total patterns calculated: ${totalPatternsCalculated}`);

    return new Response(
      JSON.stringify({
        success: true,
        dealers_processed: dealers?.length || 0,
        total_patterns: totalPatternsCalculated,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in calculate-seasonal-patterns:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Helper function
function getMonthNames(monthNumbers: number[]): string {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return monthNumbers.map((m) => monthNames[m - 1]).join(", ");
}
