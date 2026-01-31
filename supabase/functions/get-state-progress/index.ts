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
// GET STATE PROGRESS
// Returns coverage status for all 50 states + DC
// Shows which states need attention
// ============================================

interface StateProgress {
  state_code: string;
  state_name: string;
  dmv_name: string;
  dmv_forms_url: string;
  discovery_status: string;

  // Form counts
  total_forms: number;
  forms_with_confirmed_number: number;
  forms_needing_number: number;
  forms_with_mapping: number;
  verified_forms: number;
  production_forms: number;

  // Coverage percentages
  form_number_coverage_pct: number;
  mapping_coverage_pct: number;
  verified_coverage_pct: number;

  // Status
  status_summary: string;
  needs_attention: boolean;
  attention_reason?: string;
}

interface Summary {
  total_states: number;
  states_complete: number;
  states_partial: number;
  states_not_started: number;
  states_needing_attention: number;

  // Total form counts across all states
  total_forms: number;
  total_forms_with_number: number;
  total_verified: number;
  total_production: number;

  // Overall coverage
  overall_form_number_coverage_pct: number;
  overall_verified_coverage_pct: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const stateFilter = url.searchParams.get("state")?.toUpperCase();
    const statusFilter = url.searchParams.get("status"); // 'complete', 'partial', 'not_started', 'needs_attention'
    const includeFormsParam = url.searchParams.get("include_forms");
    const includeForms = includeFormsParam === "true";

    console.log(`[get-state-progress] Getting progress${stateFilter ? ` for ${stateFilter}` : " for all states"}`);

    // Get all state metadata
    let metadataQuery = supabase
      .from("state_metadata")
      .select("*")
      .order("state_code");

    if (stateFilter) {
      metadataQuery = metadataQuery.eq("state_code", stateFilter);
    }

    const { data: stateMetadata, error: metadataError } = await metadataQuery;

    if (metadataError) {
      throw new Error(`Failed to get state metadata: ${metadataError.message}`);
    }

    if (!stateMetadata || stateMetadata.length === 0) {
      throw new Error(stateFilter ? `State not found: ${stateFilter}` : "No state metadata found");
    }

    // Get form counts per state
    const { data: formCounts, error: formCountsError } = await supabase
      .from("form_staging")
      .select("state, form_number_confirmed, mapping_status, workflow_status, field_mappings");

    if (formCountsError) {
      throw new Error(`Failed to get form counts: ${formCountsError.message}`);
    }

    // Build counts map by state
    const countsByState: Record<string, {
      total: number;
      with_number: number;
      without_number: number;
      with_mapping: number;
      verified: number;
      production: number;
    }> = {};

    for (const form of formCounts || []) {
      if (!countsByState[form.state]) {
        countsByState[form.state] = {
          total: 0,
          with_number: 0,
          without_number: 0,
          with_mapping: 0,
          verified: 0,
          production: 0,
        };
      }

      const counts = countsByState[form.state];
      counts.total++;

      if (form.form_number_confirmed) {
        counts.with_number++;
      } else {
        counts.without_number++;
      }

      if (form.field_mappings && Array.isArray(form.field_mappings) && form.field_mappings.length > 0) {
        counts.with_mapping++;
      }

      if (form.mapping_status === "human_verified") {
        counts.verified++;
      }

      if (form.workflow_status === "production") {
        counts.production++;
      }
    }

    // Build state progress list
    const stateProgress: StateProgress[] = [];

    for (const state of stateMetadata) {
      const counts = countsByState[state.state_code] || {
        total: 0, with_number: 0, without_number: 0, with_mapping: 0, verified: 0, production: 0
      };

      // Calculate percentages
      const formNumberCoveragePct = counts.total > 0
        ? Math.round((counts.with_number / counts.total) * 100 * 10) / 10
        : 0;
      const mappingCoveragePct = counts.total > 0
        ? Math.round((counts.with_mapping / counts.total) * 100 * 10) / 10
        : 0;
      const verifiedCoveragePct = counts.total > 0
        ? Math.round((counts.verified / counts.total) * 100 * 10) / 10
        : 0;

      // Determine status summary
      let statusSummary: string;
      let needsAttention = false;
      let attentionReason: string | undefined;

      if (state.forms_discovery_status === "not_started") {
        statusSummary = "Not Started";
        needsAttention = true;
        attentionReason = "Forms not yet discovered";
      } else if (counts.total === 0) {
        statusSummary = "No Forms";
        needsAttention = true;
        attentionReason = "No forms in database";
      } else if (counts.without_number === 0 && counts.verified === counts.total) {
        statusSummary = "Complete";
      } else if (counts.without_number === 0) {
        statusSummary = "Ready for Mapping";
      } else if (counts.with_number > 0) {
        statusSummary = "Partial";
        if (counts.without_number > 0) {
          needsAttention = true;
          attentionReason = `${counts.without_number} forms need form numbers`;
        }
      } else {
        statusSummary = "Needs Form Numbers";
        needsAttention = true;
        attentionReason = "All forms need form numbers";
      }

      const progress: StateProgress = {
        state_code: state.state_code,
        state_name: state.state_name,
        dmv_name: state.dmv_name,
        dmv_forms_url: state.dmv_forms_url,
        discovery_status: state.forms_discovery_status,

        total_forms: counts.total,
        forms_with_confirmed_number: counts.with_number,
        forms_needing_number: counts.without_number,
        forms_with_mapping: counts.with_mapping,
        verified_forms: counts.verified,
        production_forms: counts.production,

        form_number_coverage_pct: formNumberCoveragePct,
        mapping_coverage_pct: mappingCoveragePct,
        verified_coverage_pct: verifiedCoveragePct,

        status_summary: statusSummary,
        needs_attention: needsAttention,
        attention_reason: attentionReason,
      };

      // Apply status filter
      if (statusFilter) {
        if (statusFilter === "complete" && statusSummary !== "Complete") continue;
        if (statusFilter === "partial" && statusSummary !== "Partial") continue;
        if (statusFilter === "not_started" && statusSummary !== "Not Started") continue;
        if (statusFilter === "needs_attention" && !needsAttention) continue;
      }

      stateProgress.push(progress);
    }

    // Calculate summary
    const summary: Summary = {
      total_states: stateProgress.length,
      states_complete: stateProgress.filter(s => s.status_summary === "Complete").length,
      states_partial: stateProgress.filter(s => s.status_summary === "Partial" || s.status_summary === "Ready for Mapping").length,
      states_not_started: stateProgress.filter(s => s.status_summary === "Not Started" || s.status_summary === "No Forms").length,
      states_needing_attention: stateProgress.filter(s => s.needs_attention).length,

      total_forms: stateProgress.reduce((sum, s) => sum + s.total_forms, 0),
      total_forms_with_number: stateProgress.reduce((sum, s) => sum + s.forms_with_confirmed_number, 0),
      total_verified: stateProgress.reduce((sum, s) => sum + s.verified_forms, 0),
      total_production: stateProgress.reduce((sum, s) => sum + s.production_forms, 0),

      overall_form_number_coverage_pct: 0,
      overall_verified_coverage_pct: 0,
    };

    if (summary.total_forms > 0) {
      summary.overall_form_number_coverage_pct = Math.round((summary.total_forms_with_number / summary.total_forms) * 100 * 10) / 10;
      summary.overall_verified_coverage_pct = Math.round((summary.total_verified / summary.total_forms) * 100 * 10) / 10;
    }

    // Optionally include forms for each state
    let formsNeededAttention: any[] = [];
    if (includeForms && stateFilter) {
      const { data: forms, error: formsError } = await supabase
        .from("form_staging")
        .select("id, form_name, form_number, form_number_confirmed, workflow_status, mapping_status")
        .eq("state", stateFilter)
        .order("form_name");

      if (!formsError && forms) {
        formsNeededAttention = forms.filter(f =>
          !f.form_number_confirmed ||
          f.workflow_status === "needs_form_number" ||
          f.workflow_status === "needs_upload" ||
          f.mapping_status === "pending"
        );
      }
    }

    // Build response
    const response: any = {
      success: true,
      summary,
      states: stateProgress,
    };

    if (includeForms && stateFilter) {
      response.forms_needing_attention = formsNeededAttention;
    }

    // Add priority list - states that need the most attention
    response.priority_states = stateProgress
      .filter(s => s.needs_attention)
      .sort((a, b) => {
        // Sort by: not started first, then by forms needing numbers
        if (a.status_summary === "Not Started" && b.status_summary !== "Not Started") return -1;
        if (b.status_summary === "Not Started" && a.status_summary !== "Not Started") return 1;
        return b.forms_needing_number - a.forms_needing_number;
      })
      .slice(0, 10)
      .map(s => ({
        state_code: s.state_code,
        state_name: s.state_name,
        reason: s.attention_reason,
        forms_needing_number: s.forms_needing_number,
      }));

    console.log(`[get-state-progress] Returning ${stateProgress.length} states, ${summary.states_needing_attention} need attention`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[get-state-progress] Error:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
