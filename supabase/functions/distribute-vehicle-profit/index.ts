import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// PROFIT DISTRIBUTION ENGINE
// ============================================
// Called when a vehicle is sold to:
// 1. Calculate gross profit
// 2. Split profit (investor %, platform %, dealer %)
// 3. Distribute to each investor based on pool ownership
// 4. Return capital to pool
// 5. Create distribution records

interface DistributeRequest {
  vehicle_id: string; // investor_vehicles.id
  sale_price: number;
  sale_date: string; // YYYY-MM-DD
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vehicle_id, sale_price, sale_date }: DistributeRequest = await req.json();

    if (!vehicle_id || !sale_price || !sale_date) {
      throw new Error("Missing required fields: vehicle_id, sale_price, sale_date");
    }

    console.log(`[DISTRIBUTE] Processing vehicle ${vehicle_id}, sale price: $${sale_price}`);

    // ============================================
    // 1. GET VEHICLE AND POOL INFO
    // ============================================

    const { data: vehicle, error: vehicleError } = await supabase
      .from('investor_vehicles')
      .select(`
        *,
        pool:investment_pools(*)
      `)
      .eq('id', vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      throw new Error(`Vehicle not found: ${vehicleError?.message}`);
    }

    if (vehicle.status === 'sold') {
      throw new Error('Vehicle already marked as sold');
    }

    const pool = vehicle.pool;

    // ============================================
    // 2. CALCULATE PROFIT AND SPLITS
    // ============================================

    const purchasePrice = parseFloat(vehicle.purchase_price);
    const totalCosts = parseFloat(vehicle.total_costs || 0);
    const netSalePrice = sale_price;

    const grossProfit = netSalePrice - purchasePrice - totalCosts;

    if (grossProfit < 0) {
      console.warn(`[DISTRIBUTE] Vehicle sold at a loss: -$${Math.abs(grossProfit)}`);
    }

    // Split profit according to pool terms
    const investorProfitShare = parseFloat(pool.investor_profit_share) / 100;
    const platformFeeShare = parseFloat(pool.platform_fee_share) / 100;
    const dealerProfitShare = parseFloat(pool.dealer_profit_share) / 100;

    const investorProfit = grossProfit * investorProfitShare;
    const platformFee = grossProfit * platformFeeShare;
    const dealerProfit = grossProfit * dealerProfitShare;

    console.log(`[DISTRIBUTE] Gross Profit: $${grossProfit.toFixed(2)}`);
    console.log(`[DISTRIBUTE] Investor Share (${pool.investor_profit_share}%): $${investorProfit.toFixed(2)}`);
    console.log(`[DISTRIBUTE] Platform Fee (${pool.platform_fee_share}%): $${platformFee.toFixed(2)}`);
    console.log(`[DISTRIBUTE] Dealer Share (${pool.dealer_profit_share}%): $${dealerProfit.toFixed(2)}`);

    // ============================================
    // 3. UPDATE VEHICLE RECORD
    // ============================================

    const { error: updateError } = await supabase
      .from('investor_vehicles')
      .update({
        sale_price: netSalePrice,
        sale_date: sale_date,
        gross_profit: grossProfit,
        investor_profit: investorProfit,
        platform_fee_amount: platformFee,
        dealer_profit: dealerProfit,
        status: 'sold',
      })
      .eq('id', vehicle_id);

    if (updateError) {
      throw new Error(`Failed to update vehicle: ${updateError.message}`);
    }

    // ============================================
    // 4. GET ALL POOL INVESTORS
    // ============================================

    const { data: poolShares, error: sharesError } = await supabase
      .from('investor_pool_shares')
      .select('*, investor:investors(*)')
      .eq('pool_id', pool.id)
      .eq('active', true);

    if (sharesError) {
      throw new Error(`Failed to get pool shares: ${sharesError.message}`);
    }

    console.log(`[DISTRIBUTE] Found ${poolShares.length} investors in pool`);

    // ============================================
    // 5. DISTRIBUTE PROFIT TO EACH INVESTOR
    // ============================================

    const distributions = [];

    for (const share of poolShares) {
      const ownershipPercent = parseFloat(share.ownership_percentage) / 100;
      const investorShare = investorProfit * ownershipPercent;

      if (investorShare <= 0) {
        console.log(`[DISTRIBUTE] Skipping ${share.investor.full_name} - zero profit share`);
        continue;
      }

      console.log(`[DISTRIBUTE] ${share.investor.full_name} (${share.ownership_percentage}%): $${investorShare.toFixed(2)}`);

      // Create distribution record
      const { data: distribution, error: distError } = await supabase
        .from('investor_distributions')
        .insert({
          investor_id: share.investor_id,
          pool_id: pool.id,
          vehicle_id: vehicle_id,
          distribution_type: 'profit',
          amount: investorShare,
          status: 'pending',
          scheduled_date: new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (distError) {
        console.error(`[DISTRIBUTE] Error creating distribution for ${share.investor.full_name}:`, distError);
        continue;
      }

      distributions.push(distribution);

      // Update investor totals
      await supabase.rpc('increment_investor_profit', {
        p_investor_id: share.investor_id,
        p_amount: investorShare,
      });

      // Update pool share totals
      await supabase
        .from('investor_pool_shares')
        .update({
          total_profit_earned: parseFloat(share.total_profit_earned || 0) + investorShare,
        })
        .eq('id', share.id);
    }

    // ============================================
    // 6. RETURN CAPITAL TO POOL
    // ============================================

    const capitalToReturn = purchasePrice; // Return original purchase price

    const { error: poolUpdateError } = await supabase
      .from('investment_pools')
      .update({
        deployed_capital: parseFloat(pool.deployed_capital) - capitalToReturn,
        available_capital: parseFloat(pool.available_capital) + capitalToReturn,
        total_profit: parseFloat(pool.total_profit || 0) + grossProfit,
        total_vehicles_sold: (pool.total_vehicles_sold || 0) + 1,
      })
      .eq('id', pool.id);

    if (poolUpdateError) {
      console.error('[DISTRIBUTE] Error updating pool:', poolUpdateError);
    }

    // ============================================
    // 7. LOG TRANSACTION
    // ============================================

    await supabase
      .from('pool_transactions')
      .insert({
        pool_id: pool.id,
        transaction_type: 'vehicle_sale',
        amount: netSalePrice,
        description: `Vehicle sold: ${vehicle.vehicle_info?.year} ${vehicle.vehicle_info?.make} ${vehicle.vehicle_info?.model}`,
        vehicle_id: vehicle_id,
        transaction_date: new Date().toISOString(),
      });

    // ============================================
    // 8. RETURN RESULTS
    // ============================================

    return new Response(
      JSON.stringify({
        success: true,
        vehicle_id: vehicle_id,
        sale_price: netSalePrice,
        gross_profit: grossProfit,
        profit_split: {
          investor_total: investorProfit,
          platform_fee: platformFee,
          dealer_profit: dealerProfit,
        },
        distributions_created: distributions.length,
        distributions: distributions,
        message: `Successfully distributed $${investorProfit.toFixed(2)} to ${distributions.length} investors`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[DISTRIBUTE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================
// HELPER FUNCTION (to be created as SQL function)
// ============================================
/*
CREATE OR REPLACE FUNCTION increment_investor_profit(
  p_investor_id uuid,
  p_amount numeric
)
RETURNS void AS $$
BEGIN
  UPDATE investors
  SET
    total_profit = COALESCE(total_profit, 0) + p_amount,
    available_balance = COALESCE(available_balance, 0) + p_amount,
    updated_at = now()
  WHERE id = p_investor_id;
END;
$$ LANGUAGE plpgsql;
*/
