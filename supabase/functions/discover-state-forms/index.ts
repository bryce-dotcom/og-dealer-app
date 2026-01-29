import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State agency context for AI research
const stateContext: Record<string, string> = {
  UT: "Utah DMV, Utah State Tax Commission, Utah MVED",
  TX: "TxDMV, Texas Comptroller",
  CA: "California DMV, CDTFA",
  FL: "Florida DHSMV, Florida DOR",
  ID: "Idaho ITD, Idaho Tax Commission",
  AZ: "Arizona MVD, Arizona DOR",
  CO: "Colorado DMV, Colorado DOR",
  NV: "Nevada DMV, Nevada Taxation",
};

// Quick URL check (3s timeout)
async function checkUrl(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, dealer_id } = await req.json();
    if (!state) throw new Error("State is required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing Anthropic API key");

    const stateUpper = state.toUpperCase();
    const agencies = stateContext[stateUpper] || `${stateUpper} DMV, ${stateUpper} Tax Commission`;

    // Get existing forms to avoid duplicates
    const { data: existing } = await supabase
      .from("form_staging")
      .select("form_number, form_name")
      .eq("state", stateUpper);

    const existingKeys = new Set([
      ...(existing?.map(f => f.form_number?.toUpperCase()).filter(Boolean) || []),
      ...(existing?.map(f => f.form_name?.toLowerCase()).filter(Boolean) || [])
    ]);

    console.log(`[${stateUpper}] Discovering forms...`);

    // AI Research - ask for ALL forms
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        system: `You research auto dealer compliance forms. List ALL required forms for dealers in ${stateUpper}.
Agencies: ${agencies}, plus Federal (FTC, DOT).
Return ONLY a JSON array. No markdown. Include forms even if you don't know the PDF URL.`,
        messages: [{
          role: "user",
          content: `List ALL forms a used car dealer needs in ${stateUpper}:

1. TITLE/REGISTRATION: Title application, registration, temp permits, lien release, POA, odometer disclosure
2. TAX: Sales tax returns, exemption certificates
3. DEAL DOCS: Bill of sale, buyer's order, FTC Buyers Guide, as-is disclosure, delivery receipt
4. COMPLIANCE: Dealer license, surety bond, salesperson license
5. FINANCING: Retail installment contract, truth in lending, privacy notice

Return JSON array:
[
  {
    "form_name": "Form Name",
    "form_number": "TC-123" or null,
    "category": "deal|title|tax|compliance|financing",
    "description": "What it's for",
    "source_url": "https://..." or null
  }
]

Include 20-35 forms. Set source_url to null if unsure.`
        }],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text || "[]";

    // Parse JSON
    let forms: any[] = [];
    try {
      let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) cleaned = match[0];
      forms = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    if (!Array.isArray(forms) || forms.length === 0) {
      throw new Error("No forms returned");
    }

    console.log(`[${stateUpper}] AI found ${forms.length} forms. Validating URLs...`);

    // Validate all URLs in parallel
    const validated = await Promise.all(
      forms.map(async (form) => ({
        form,
        urlValid: form.source_url ? await checkUrl(form.source_url) : false
      }))
    );

    // Build insert list - ADD ALL FORMS
    const toInsert: any[] = [];
    const skipped: string[] = [];
    let readyCount = 0;
    let needsUploadCount = 0;

    for (const { form, urlValid } of validated) {
      if (!form.form_name) continue;

      const formNum = form.form_number?.toUpperCase()?.trim();
      const formName = form.form_name?.toLowerCase()?.trim();

      // Skip duplicates
      if ((formNum && existingKeys.has(formNum)) || (formName && existingKeys.has(formName))) {
        skipped.push(formNum || form.form_name);
        continue;
      }
      existingKeys.add(formNum || "");
      existingKeys.add(formName || "");

      // Determine status based on URL validity
      // PDF valid → staging (ready for HTML generation)
      // PDF invalid/missing → needs_upload (user must upload PDF)
      const workflowStatus = urlValid ? "staging" : "needs_upload";

      if (urlValid) {
        readyCount++;
      } else {
        needsUploadCount++;
      }

      let category = form.category?.toLowerCase() || "deal";
      if (!["deal", "title", "tax", "compliance", "financing"].includes(category)) {
        category = "deal";
      }

      toInsert.push({
        form_number: formNum || null,
        form_name: form.form_name.trim(),
        state: stateUpper,
        source_url: form.source_url || null,
        category,
        description: form.description || null,
        workflow_status: workflowStatus,
        pdf_validated: urlValid,
        ai_discovered: true,
        ...(dealer_id ? { dealer_id } : {}),
      });
    }

    console.log(`[${stateUpper}] Inserting ${toInsert.length} forms (${readyCount} ready, ${needsUploadCount} need upload)...`);

    // Insert all forms
    let insertedCount = 0;
    let insertError = null;

    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from("form_staging")
        .insert(toInsert)
        .select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // Fallback: try with just 'staging' status if constraint fails
        if (error.message.includes("violates") || error.message.includes("constraint")) {
          console.log(`[${stateUpper}] Retrying with staging status...`);

          const fallbackInsert = toInsert.map(f => ({
            ...f,
            workflow_status: "staging" // Use safe default
          }));

          const { data: retryData, error: retryError } = await supabase
            .from("form_staging")
            .insert(fallbackInsert)
            .select("id");

          if (retryError) {
            insertError = retryError.message;
          } else {
            insertedCount = retryData?.length || 0;
          }
        } else {
          insertError = error.message;
        }
      } else {
        insertedCount = data?.length || 0;
      }
    }

    console.log(`[${stateUpper}] Done: ${insertedCount} inserted`);

    // Build response with full form list
    const formsList = toInsert.map(f => ({
      form_name: f.form_name,
      form_number: f.form_number,
      category: f.category,
      workflow_status: f.workflow_status,
      pdf_validated: f.pdf_validated,
      source_url: f.source_url,
      description: f.description,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        total_found: forms.length,
        total_inserted: insertedCount,
        ready_for_processing: readyCount,
        needs_upload: needsUploadCount,
        duplicates_skipped: skipped.length,
        forms: formsList,
        ...(insertError ? { error: insertError } : {}),
        message: `Found ${forms.length} forms. ${insertedCount} added to database (${readyCount} ready, ${needsUploadCount} need PDF upload).`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
