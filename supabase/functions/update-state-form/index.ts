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
// UPDATE STATE FORM
// Admin function to add/update individual state forms
// with verified form numbers and optional PDF URLs
// ============================================

interface UpdateFormRequest {
  // Identify the form to update (one of these required)
  form_id?: number;
  state?: string;
  form_name?: string;

  // Updates (at least one required)
  form_number?: string;
  pdf_url?: string;
  description?: string;
  category?: string;
  deal_types?: string[];
  is_primary?: boolean;

  // Options
  create_if_missing?: boolean; // Create form if it doesn't exist
  mark_confirmed?: boolean; // Explicitly mark form number as confirmed (default: true if form_number provided)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: UpdateFormRequest = await req.json();

    // Validate request
    const hasIdentifier = body.form_id || (body.state && body.form_name);
    if (!hasIdentifier) {
      throw new Error("Must provide either form_id or both state and form_name");
    }

    const hasUpdate = body.form_number || body.pdf_url || body.description ||
                      body.category || body.deal_types || body.is_primary !== undefined;
    if (!hasUpdate && !body.create_if_missing) {
      throw new Error("Must provide at least one field to update");
    }

    // Validate form_number is not a placeholder
    if (body.form_number) {
      const isPlaceholder = /^[A-Z]{2}-[A-Z]+(-\d+)?$/.test(body.form_number);
      if (isPlaceholder) {
        throw new Error("Invalid form number format - looks like a placeholder. Please provide the official form number.");
      }
    }

    let form: any = null;
    let formId: number | null = body.form_id || null;

    // Find existing form
    if (formId) {
      const { data, error } = await supabase
        .from("form_staging")
        .select("*")
        .eq("id", formId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database error: ${error.message}`);
      }
      form = data;
    } else if (body.state && body.form_name) {
      const { data, error } = await supabase
        .from("form_staging")
        .select("*")
        .eq("state", body.state.toUpperCase())
        .eq("form_name", body.form_name)
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Database error: ${error.message}`);
      }
      form = data;
      if (form) {
        formId = form.id;
      }
    }

    // Create form if it doesn't exist and create_if_missing is true
    if (!form && body.create_if_missing && body.state && body.form_name) {
      console.log(`[update-state-form] Creating new form: ${body.form_name} for ${body.state}`);

      const newForm = {
        state: body.state.toUpperCase(),
        form_name: body.form_name,
        form_number: body.form_number || null,
        form_number_confirmed: body.form_number ? (body.mark_confirmed !== false) : false,
        category: body.category || "other",
        description: body.description || "",
        workflow_status: body.form_number ? "staging" : "needs_form_number",
        pdf_validated: false,
        source_url: body.pdf_url || null,
        deal_types: body.deal_types || null,
        is_primary: body.is_primary || false,
        mapping_status: "pending",
        ai_discovered: false,
      };

      const { data: insertedForm, error: insertError } = await supabase
        .from("form_staging")
        .insert(newForm)
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create form: ${insertError.message}`);
      }

      // Update state metadata
      await supabase.rpc("update_state_form_counts", { p_state: body.state.toUpperCase() });

      return new Response(
        JSON.stringify({
          success: true,
          action: "created",
          form_id: insertedForm.id,
          form_name: insertedForm.form_name,
          state: insertedForm.state,
          form_number: insertedForm.form_number,
          form_number_confirmed: insertedForm.form_number_confirmed,
          workflow_status: insertedForm.workflow_status,
          message: `Created new form: ${body.form_name} for ${body.state}`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!form) {
      throw new Error(`Form not found: ${body.form_name || body.form_id} in state ${body.state || "(unknown)"}`);
    }

    // Build update object
    const updates: Record<string, any> = {};

    if (body.form_number !== undefined) {
      updates.form_number = body.form_number;
      // Mark as confirmed unless explicitly set to false
      updates.form_number_confirmed = body.mark_confirmed !== false;

      // Update workflow status if it was waiting for form number
      if (form.workflow_status === "needs_form_number") {
        updates.workflow_status = "staging";
      }
    }

    if (body.pdf_url !== undefined) {
      updates.source_url = body.pdf_url;
      // Mark URL as not yet validated (will be validated on next access)
      updates.url_validated = false;
      updates.url_error = null;
    }

    if (body.description !== undefined) {
      updates.description = body.description;
    }

    if (body.category !== undefined) {
      updates.category = body.category;
    }

    if (body.deal_types !== undefined) {
      updates.deal_types = body.deal_types;
    }

    if (body.is_primary !== undefined) {
      updates.is_primary = body.is_primary;
    }

    // Apply updates
    console.log(`[update-state-form] Updating form ${formId}:`, Object.keys(updates));

    const { data: updatedForm, error: updateError } = await supabase
      .from("form_staging")
      .update(updates)
      .eq("id", formId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update form: ${updateError.message}`);
    }

    // Update state metadata counts
    await supabase.rpc("update_state_form_counts", { p_state: form.state });

    // Build response with what changed
    const changes: string[] = [];
    if (body.form_number !== undefined) {
      changes.push(`form_number: ${form.form_number || "(none)"} -> ${body.form_number}`);
    }
    if (body.pdf_url !== undefined) {
      changes.push(`pdf_url: ${form.source_url ? "..." : "(none)"} -> ${body.pdf_url ? "..." : "(none)"}`);
    }
    if (body.description !== undefined) {
      changes.push("description updated");
    }
    if (body.category !== undefined) {
      changes.push(`category: ${form.category} -> ${body.category}`);
    }
    if (body.deal_types !== undefined) {
      changes.push(`deal_types: ${JSON.stringify(form.deal_types)} -> ${JSON.stringify(body.deal_types)}`);
    }
    if (body.is_primary !== undefined) {
      changes.push(`is_primary: ${form.is_primary} -> ${body.is_primary}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: "updated",
        form_id: updatedForm.id,
        form_name: updatedForm.form_name,
        state: updatedForm.state,
        form_number: updatedForm.form_number,
        form_number_confirmed: updatedForm.form_number_confirmed,
        workflow_status: updatedForm.workflow_status,
        changes: changes,
        message: `Updated ${updatedForm.form_name} in ${updatedForm.state}: ${changes.join(", ")}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[update-state-form] Error:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
