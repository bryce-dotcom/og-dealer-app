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
// TRANSFORM INVENTORY TO FACEBOOK FORMAT
// ============================================
function transformToFacebookCatalog(vehicle: any, dealer: any) {
  // Build dealer address string
  const dealerAddress = {
    street: dealer.address || '',
    city: dealer.city || '',
    state: dealer.state || 'UT',
    zip: dealer.zip || '',
  };

  // Transform to Facebook Automotive Inventory format
  return {
    id: vehicle.stock_number || vehicle.id, // Unique identifier
    title: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ' ' + vehicle.trim : ''}`,
    description: vehicle.description || `${vehicle.year} ${vehicle.make} ${vehicle.model} - ${vehicle.miles || 0} miles. Stock #${vehicle.stock_number || vehicle.id}`,
    availability: vehicle.status === 'Sold' ? 'out of stock' : 'in stock',
    condition: 'used',
    price: vehicle.sale_price ? `${vehicle.sale_price} USD` : undefined,
    link: `https://ogdealer.com/inventory/${vehicle.id}`, // TODO: Use actual dealer domain
    image_link: vehicle.photos?.[0] || undefined,
    additional_image_link: vehicle.photos?.slice(1, 10) || [], // Max 10 additional photos

    // Vehicle details
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim || undefined,
    vin: vehicle.vin,
    mileage: vehicle.miles ? { value: vehicle.miles, unit: 'mi' } : undefined,
    exterior_color: vehicle.color || undefined,

    // Body style mapping
    body_style: guessBodyStyle(vehicle.model),

    // Transmission (guess based on common knowledge)
    transmission: 'Automatic', // TODO: Add transmission field to inventory

    // Dealer info
    dealer_id: dealer.id.toString(),
    dealer_name: dealer.dealer_name,
    dealer_phone: dealer.phone || undefined,
    dealer_address: dealerAddress,
  };
}

// Helper to guess body style from model name
function guessBodyStyle(model: string): string {
  const modelLower = (model || '').toLowerCase();

  if (modelLower.includes('truck') || modelLower.includes('f-150') || modelLower.includes('silverado') || modelLower.includes('ram')) {
    return 'Truck';
  }
  if (modelLower.includes('suv') || modelLower.includes('tahoe') || modelLower.includes('suburban') || modelLower.includes('explorer')) {
    return 'SUV';
  }
  if (modelLower.includes('van') || modelLower.includes('minivan')) {
    return 'Van';
  }
  if (modelLower.includes('coupe')) {
    return 'Coupe';
  }
  if (modelLower.includes('sedan')) {
    return 'Sedan';
  }
  if (modelLower.includes('hatchback')) {
    return 'Hatchback';
  }
  if (modelLower.includes('convertible')) {
    return 'Convertible';
  }

  // Default
  return 'Sedan';
}

// ============================================
// SYNC TO FACEBOOK CATALOG
// ============================================
async function syncToFacebookCatalog(
  accessToken: string,
  catalogId: string,
  items: any[]
): Promise<{ success: number; errors: any[] }> {
  let successCount = 0;
  const errors: any[] = [];

  // Facebook API endpoint
  const apiUrl = `https://graph.facebook.com/v18.0/${catalogId}/items`;

  for (const item of items) {
    try {
      // Create or update catalog item
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          data: [item],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[FB] Error syncing item:', item.id, result);
        errors.push({
          item_id: item.id,
          error: result.error?.message || 'Unknown error',
        });
      } else {
        successCount++;
      }
    } catch (err) {
      console.error('[FB] Exception syncing item:', item.id, err);
      errors.push({
        item_id: item.id,
        error: err.message,
      });
    }

    // Rate limiting: Wait 100ms between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return { success: successCount, errors };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealer_id, inventory_ids } = await req.json();

    if (!dealer_id) {
      throw new Error("Missing required field: dealer_id");
    }

    console.log(`[FB-SYNC] Starting sync for dealer ${dealer_id}`);

    // Get dealer Facebook settings
    const { data: settings, error: settingsError } = await supabase
      .from('marketplace_settings')
      .select('*')
      .eq('dealer_id', dealer_id)
      .eq('marketplace', 'facebook')
      .eq('enabled', true)
      .single();

    if (settingsError || !settings) {
      throw new Error('Facebook Marketplace not enabled or configured for this dealer');
    }

    if (!settings.credentials?.access_token || !settings.credentials?.catalog_id) {
      throw new Error('Facebook credentials incomplete. Please reconnect your Facebook account.');
    }

    const { access_token, catalog_id } = settings.credentials;

    // Get dealer info
    const { data: dealer, error: dealerError } = await supabase
      .from('dealer_settings')
      .select('*')
      .eq('id', dealer_id)
      .single();

    if (dealerError) throw dealerError;

    // Get inventory to sync
    let inventoryQuery = supabase
      .from('inventory')
      .select('*')
      .eq('dealer_id', dealer_id);

    // If specific inventory_ids provided, filter to those
    if (inventory_ids && Array.isArray(inventory_ids) && inventory_ids.length > 0) {
      inventoryQuery = inventoryQuery.in('id', inventory_ids);
    }

    const { data: inventory, error: inventoryError } = await inventoryQuery;

    if (inventoryError) throw inventoryError;

    if (!inventory || inventory.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          synced: 0,
          message: 'No inventory to sync',
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[FB-SYNC] Found ${inventory.length} vehicles to sync`);

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('marketplace_sync_log')
      .insert({
        dealer_id,
        marketplace: 'facebook',
        sync_type: inventory_ids ? 'partial' : 'full',
        total_items: inventory.length,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (syncLogError) {
      console.error('[FB-SYNC] Error creating sync log:', syncLogError);
    }

    // Transform inventory to Facebook format
    const facebookItems = inventory.map(vehicle => transformToFacebookCatalog(vehicle, dealer));

    // Sync to Facebook
    const startTime = Date.now();
    const result = await syncToFacebookCatalog(access_token, catalog_id, facebookItems);
    const duration = Date.now() - startTime;

    // Update marketplace_listings table
    for (const vehicle of inventory) {
      const wasSuccess = !result.errors.find(e => e.item_id === (vehicle.stock_number || vehicle.id));

      await supabase
        .from('marketplace_listings')
        .upsert({
          dealer_id,
          inventory_id: vehicle.id,
          marketplace: 'facebook',
          listing_id: vehicle.stock_number || vehicle.id,
          status: wasSuccess ? 'active' : 'error',
          last_synced_at: new Date().toISOString(),
          sync_attempts: 1, // TODO: Increment existing value
          error_message: wasSuccess ? null : result.errors.find(e => e.item_id === (vehicle.stock_number || vehicle.id))?.error,
        }, {
          onConflict: 'dealer_id,inventory_id,marketplace',
        });
    }

    // Update sync log
    if (syncLog) {
      await supabase
        .from('marketplace_sync_log')
        .update({
          success_count: result.success,
          error_count: result.errors.length,
          items_synced: facebookItems.map(i => i.id),
          errors: result.errors,
          completed_at: new Date().toISOString(),
          duration_ms: duration,
        })
        .eq('id', syncLog.id);
    }

    // Update marketplace_settings last sync time
    await supabase
      .from('marketplace_settings')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: result.errors.length > 0 ? 'error' : 'success',
        last_sync_error: result.errors.length > 0 ? `${result.errors.length} items failed` : null,
      })
      .eq('dealer_id', dealer_id)
      .eq('marketplace', 'facebook');

    console.log(`[FB-SYNC] Complete: ${result.success} synced, ${result.errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: result.success,
        errors: result.errors.length,
        error_details: result.errors,
        duration_ms: duration,
        message: `Synced ${result.success} of ${inventory.length} vehicles to Facebook Marketplace`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[FB-SYNC] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
