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
// DEPLOY CAPITAL TO VEHICLE
// ============================================
// Called when dealer purchases a vehicle using investor pool funds
// This links the vehicle to the investment pool and deploys capital

interface DeployRequest {
  pool_id: string;
  inventory_id: string;
  dealer_id: number;
  purchase_price: number;
  purchase_date?: string; // YYYY-MM-DD (defaults to today)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      pool_id,
      inventory_id,
      dealer_id,
      purchase_price,
      purchase_date = new Date().toISOString().split('T')[0]
    }: DeployRequest = await req.json();

    if (!pool_id || !inventory_id || !dealer_id || !purchase_price) {
      throw new Error("Missing required fields: pool_id, inventory_id, dealer_id, purchase_price");
    }

    console.log(`[DEPLOY] Deploying $${purchase_price} to vehicle ${inventory_id} from pool ${pool_id}`);

    // ============================================
    // 1. GET POOL INFO
    // ============================================

    const { data: pool, error: poolError } = await supabase
      .from('investment_pools')
      .select('*')
      .eq('id', pool_id)
      .single();

    if (poolError || !pool) {
      throw new Error(`Pool not found: ${poolError?.message}`);
    }

    if (pool.status !== 'active') {
      throw new Error(`Pool is not active (status: ${pool.status})`);
    }

    const availableCapital = parseFloat(pool.available_capital || 0);

    if (availableCapital < purchase_price) {
      throw new Error(
        `Insufficient capital in pool. Available: $${availableCapital}, Required: $${purchase_price}`
      );
    }

    // ============================================
    // 2. GET VEHICLE INFO FROM INVENTORY
    // ============================================

    const { data: vehicle, error: vehicleError } = await supabase
      .from('inventory')
      .select('id, year, make, model, trim, vin, stock_number, color')
      .eq('id', inventory_id)
      .single();

    if (vehicleError || !vehicle) {
      throw new Error(`Vehicle not found in inventory: ${vehicleError?.message}`);
    }

    const vehicleInfo = {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      vin: vehicle.vin,
      stock_number: vehicle.stock_number,
      color: vehicle.color,
    };

    // ============================================
    // 3. CALL SQL FUNCTION TO DEPLOY CAPITAL
    // ============================================

    const { data: vehicleId, error: deployError } = await supabase.rpc(
      'deploy_capital_to_vehicle',
      {
        p_pool_id: pool_id,
        p_inventory_id: inventory_id,
        p_dealer_id: dealer_id,
        p_purchase_price: purchase_price,
        p_purchase_date: purchase_date,
        p_vehicle_info: vehicleInfo,
      }
    );

    if (deployError) {
      throw new Error(`Failed to deploy capital: ${deployError.message}`);
    }

    console.log(`[DEPLOY] Success! Created investor_vehicle record: ${vehicleId}`);

    // ============================================
    // 4. GET UPDATED POOL STATS
    // ============================================

    const { data: updatedPool } = await supabase
      .from('investment_pools')
      .select('total_capital, deployed_capital, available_capital, total_vehicles_funded')
      .eq('id', pool_id)
      .single();

    // ============================================
    // 5. RETURN SUCCESS
    // ============================================

    return new Response(
      JSON.stringify({
        success: true,
        vehicle_id: vehicleId,
        pool_id: pool_id,
        capital_deployed: purchase_price,
        vehicle_info: vehicleInfo,
        pool_stats: updatedPool,
        message: `Successfully deployed $${purchase_price.toFixed(2)} to vehicle ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[DEPLOY] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
