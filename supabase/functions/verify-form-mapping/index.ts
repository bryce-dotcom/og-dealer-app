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
// VERIFY FORM MAPPING
// Marks mappings as human-verified and shares them
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, dealer_id, field_mappings, notes } = await req.json();

    if (!form_id) throw new Error("form_id is required");

    // Get form details
    const { data: form, error: formError } = await supabase
      .from("form_staging")
      .select("*")
      .eq("id", form_id)
      .single();

    if (formError || !form) {
      throw new Error(`Form not found: ${form_id}`);
    }

    // Use provided mappings or existing ones
    const mappingsToVerify = field_mappings || form.field_mappings;

    if (!mappingsToVerify || mappingsToVerify.length === 0) {
      throw new Error("No field mappings to verify. Run 'Analyze PDF' first.");
    }

    console.log(`[verify-mapping] Verifying ${mappingsToVerify.length} mappings for ${form.form_name} (${form.state})`);

    // Count mapped vs unmapped
    const mappedCount = mappingsToVerify.filter((m: any) => m.universal_field).length;
    const unmappedCount = mappingsToVerify.filter((m: any) => !m.universal_field).length;

    // Update form_staging to mark as verified
    const { error: updateError } = await supabase
      .from("form_staging")
      .update({
        field_mappings: mappingsToVerify,
        mapping_status: "human_verified"
      })
      .eq("id", form_id);

    if (updateError) {
      throw new Error(`Failed to update form: ${updateError.message}`);
    }

    // Upsert to shared_form_mappings
    const { data: sharedMapping, error: sharedError } = await supabase
      .from("shared_form_mappings")
      .upsert({
        state: form.state,
        form_name: form.form_name,
        form_number: form.form_number,
        field_mappings: mappingsToVerify,
        pdf_fields_count: mappingsToVerify.length,
        mapped_fields_count: mappedCount,
        unmapped_fields: mappingsToVerify
          .filter((m: any) => !m.universal_field)
          .map((m: any) => m.pdf_field),
        verified_by_dealer_id: dealer_id || null,
        verified_at: new Date().toISOString(),
        verification_notes: notes || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "state,form_name"
      })
      .select()
      .single();

    if (sharedError) {
      console.error(`[verify-mapping] Shared mapping error:`, sharedError.message);
      // Don't fail the whole operation, just log
    }

    // Get count of other dealers who will benefit
    const { count: otherDealersCount } = await supabase
      .from("form_staging")
      .select("dealer_id", { count: "exact", head: true })
      .eq("state", form.state)
      .eq("form_name", form.form_name)
      .neq("id", form_id);

    console.log(`[verify-mapping] Verified! ${otherDealersCount || 0} other dealers will benefit.`);

    return new Response(
      JSON.stringify({
        success: true,
        form_id: form_id,
        form_name: form.form_name,
        state: form.state,

        // Verification results
        mapping_status: "human_verified",
        total_fields: mappingsToVerify.length,
        mapped_fields: mappedCount,
        unmapped_fields: unmappedCount,

        // Sharing info
        shared_mapping_id: sharedMapping?.id,
        shared_to_other_dealers: true,
        dealers_benefiting: otherDealersCount || 0,

        message: `Verified ${mappedCount} field mappings for ${form.form_name}. Shared with ${otherDealersCount || 0} other ${form.state} dealers.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[verify-mapping] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
