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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("[MIGRATION] Running state_fee_schedules migration...");

  try {
    // Create table
    const { error: createError } = await supabase.rpc('exec', {
      sql: `
        CREATE TABLE IF NOT EXISTS state_fee_schedules (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          state TEXT NOT NULL,
          fee_type TEXT NOT NULL,
          fee_name TEXT,
          calculation_type TEXT,
          base_amount DECIMAL(10,2),
          formula JSONB,
          applies_to TEXT[],
          county_specific BOOLEAN DEFAULT false,
          source_url TEXT,
          source_agency TEXT,
          last_verified DATE,
          ai_discovered BOOLEAN DEFAULT false,
          human_verified BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT now(),
          UNIQUE(state, fee_type)
        );
      `
    });

    if (createError) throw new Error(`Create table failed: ${createError.message}`);

    // Insert Utah fees
    const utahFees = [
      { state: 'UT', fee_type: 'registration', fee_name: 'Registration Fee', calculation_type: 'flat', base_amount: 44.00, formula: {"type":"flat","amount":44}, source_agency: 'Utah DMV', human_verified: true },
      { state: 'UT', fee_type: 'license', fee_name: 'License Fee', calculation_type: 'flat', base_amount: 6.00, formula: {"type":"flat","amount":6}, source_agency: 'Utah DMV', human_verified: true },
      { state: 'UT', fee_type: 'title', fee_name: 'Title Fee', calculation_type: 'flat', base_amount: 6.00, formula: {"type":"flat","amount":6}, source_agency: 'Utah DMV', human_verified: true },
      { state: 'UT', fee_type: 'property_tax', fee_name: 'Age-Based Property Tax', calculation_type: 'age_based', base_amount: null, formula: {"type":"age_based_percentage","base_field":"msrp","rates_by_age":{"0":0.01,"1":0.0085,"2":0.007,"3":0.0055,"4":0.004,"5":0.0025,"6+":0.001},"minimum":10}, source_agency: 'Utah Tax Commission', human_verified: true },
      { state: 'UT', fee_type: 'emissions', fee_name: 'Emissions Fee', calculation_type: 'flat', base_amount: 35.00, formula: {"type":"flat","amount":35}, source_agency: 'Utah DMV', human_verified: true },
      { state: 'UT', fee_type: 'waste_tire', fee_name: 'Waste Tire Fee', calculation_type: 'flat', base_amount: 1.00, formula: {"type":"flat","amount":1}, source_agency: 'Utah DMV', human_verified: true },
      { state: 'UT', fee_type: 'inspection', fee_name: 'Safety Inspection', calculation_type: 'flat', base_amount: 0, formula: {"type":"flat","amount":0}, source_agency: 'Utah DMV', human_verified: true }
    ];

    const { error: insertError } = await supabase
      .from('state_fee_schedules')
      .upsert(utahFees, { onConflict: 'state,fee_type' });

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

    // Verify
    const { data: fees, error: verifyError } = await supabase
      .from('state_fee_schedules')
      .select('state, fee_type, fee_name')
      .eq('state', 'UT');

    if (verifyError) throw new Error(`Verification failed: ${verifyError.message}`);

    console.log(`[MIGRATION] Success! Created ${fees.length} Utah fee schedules`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migration completed successfully. Created ${fees.length} Utah fee schedules.`,
        fees: fees
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[MIGRATION] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
