import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State agency info for better research context
const stateAgencies: Record<string, { dmv: string; tax: string; mved: string; formsPage: string }> = {
  UT: {
    dmv: "Utah Division of Motor Vehicles",
    tax: "Utah State Tax Commission",
    mved: "Utah Motor Vehicle Enforcement Division (MVED)",
    formsPage: "https://dmv.utah.gov/vehicles/dealers"
  },
  TX: {
    dmv: "Texas Department of Motor Vehicles (TxDMV)",
    tax: "Texas Comptroller of Public Accounts",
    mved: "Texas DMV Motor Vehicle Division",
    formsPage: "https://www.txdmv.gov/motorists/buying-or-selling-a-vehicle"
  },
  CA: {
    dmv: "California Department of Motor Vehicles",
    tax: "California Department of Tax and Fee Administration (CDTFA)",
    mved: "DMV Occupational Licensing",
    formsPage: "https://www.dmv.ca.gov/portal/vehicle-industry-services/occupational-licensing/"
  },
  FL: {
    dmv: "Florida DHSMV",
    tax: "Florida Department of Revenue",
    mved: "FLHSMV Dealer Services",
    formsPage: "https://www.flhsmv.gov/motor-vehicles-tags-titles/motor-vehicle-dealers/"
  },
  ID: {
    dmv: "Idaho Transportation Department (ITD)",
    tax: "Idaho State Tax Commission",
    mved: "Idaho Dealer Licensing",
    formsPage: "https://itd.idaho.gov/dmv/"
  },
  AZ: {
    dmv: "Arizona MVD",
    tax: "Arizona Department of Revenue",
    mved: "Arizona Dealer Licensing Unit",
    formsPage: "https://azdot.gov/motor-vehicles/dealer-services"
  },
  CO: {
    dmv: "Colorado DMV",
    tax: "Colorado Department of Revenue",
    mved: "Colorado Auto Industry Division",
    formsPage: "https://dmv.colorado.gov/dealer-services"
  },
  NV: {
    dmv: "Nevada DMV",
    tax: "Nevada Department of Taxation",
    mved: "Nevada DMV Compliance Enforcement",
    formsPage: "https://dmv.nv.gov/dealer.htm"
  },
};

// Validate PDF URL with HEAD request (3 second timeout)
async function validatePdfUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  if (!url) return { valid: false, error: "No URL provided" };

  try {
    new URL(url); // Validate URL format first
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { valid: true };
    }
    return { valid: false, error: `HTTP ${response.status}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Timeout' };
    }
    return { valid: false, error: 'Network error' };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, dealer_id } = await req.json();

    if (!state) {
      throw new Error("State is required");
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("Missing Anthropic API key");
    }

    const stateUpper = state.toUpperCase();
    const agencies = stateAgencies[stateUpper] || {
      dmv: `${stateUpper} Department of Motor Vehicles`,
      tax: `${stateUpper} Department of Revenue`,
      mved: `${stateUpper} Motor Vehicle Division`,
      formsPage: `https://dmv.${state.toLowerCase()}.gov`
    };

    // Check existing forms to avoid duplicates
    const { data: existingForms } = await supabase
      .from("form_staging")
      .select("form_number, form_name")
      .eq("state", stateUpper);

    const existingSet = new Set([
      ...(existingForms?.map(f => f.form_number?.toUpperCase()).filter(Boolean) || []),
      ...(existingForms?.map(f => f.form_name?.toLowerCase()).filter(Boolean) || [])
    ]);

    console.log(`[${stateUpper}] Starting discovery. ${existingSet.size} existing forms.`);

    // ========================================
    // PHASE 1: AI RESEARCH
    // ========================================

    const systemPrompt = `You are an expert on US auto dealer compliance. Research ALL forms required for a used car dealer in ${stateUpper}.

State agencies:
- ${agencies.dmv}
- ${agencies.tax}
- ${agencies.mved}
- Federal: FTC, DOT (odometer requirements)

IMPORTANT INSTRUCTIONS:
1. List EVERY required form - even if you don't know the exact PDF URL
2. For source_url: Only provide URLs you're confident are correct .gov URLs. Set to null if unsure.
3. Be comprehensive - dealers typically need 20-35 different forms/documents
4. Include federal requirements (FTC Buyers Guide, Odometer Disclosure)

Return ONLY a JSON array, no markdown.`;

    const userPrompt = `List ALL forms required for a used car dealer in ${stateUpper}. Include:

TITLE/REGISTRATION (per sale):
- Title application/transfer
- Registration application
- Temporary permit
- Lien release/satisfaction
- Power of attorney
- Odometer disclosure (federal)

TAX FORMS:
- Sales tax return (frequency varies by state)
- Tax exemption certificates
- Dealer sales reports

DEAL DOCUMENTS (per transaction):
- Bill of Sale (state-specific)
- Buyer's Order / Purchase Agreement
- FTC Buyers Guide (federal - ALL used car dealers)
- As-Is Warranty Disclosure
- Vehicle Condition Report
- Delivery Receipt/Acknowledgment

DEALER COMPLIANCE:
- Dealer license application/renewal
- Surety bond requirements
- Salesperson license (if required)

BHPH/FINANCING (if applicable):
- Retail Installment Contract
- Truth in Lending Disclosure (federal Reg Z)
- Privacy Notice (federal GLBA)
- Risk-Based Pricing Notice

Return JSON array with this structure:
{
  "form_name": "Name of form",
  "form_number": "TC-69" or null,
  "category": "deal" | "title" | "tax" | "compliance" | "financing",
  "description": "What it's used for",
  "source_url": "https://exact.url/form.pdf" or null,
  "issuing_authority": "Utah DMV" | "FTC" | etc,
  "frequency": "per_deal" | "monthly" | "annually" | "as_needed",
  "required_for": ["cash_deal", "financed_deal", "trade_in"]
}`;

    console.log(`[${stateUpper}] Calling Claude API...`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${stateUpper}] Anthropic API error:`, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "[]";

    // Parse JSON
    let forms: any[] = [];
    try {
      let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) cleaned = match[0];
      forms = JSON.parse(cleaned);
    } catch (e) {
      console.error(`[${stateUpper}] JSON parse error:`, content.substring(0, 200));
      throw new Error("Failed to parse AI response");
    }

    if (!Array.isArray(forms) || forms.length === 0) {
      throw new Error("AI returned no forms");
    }

    console.log(`[${stateUpper}] AI found ${forms.length} forms. Validating...`);

    // ========================================
    // PHASE 2: VALIDATE URLs (parallel)
    // ========================================

    const validationResults = await Promise.all(
      forms.map(async (form) => {
        const validation = form.source_url
          ? await validatePdfUrl(form.source_url)
          : { valid: false, error: "No URL" };
        return { form, validation };
      })
    );

    // ========================================
    // PHASE 3: INSERT ALL FORMS
    // ========================================

    const formsToInsert: any[] = [];
    const duplicatesSkipped: string[] = [];
    let validPdfCount = 0;
    let needsUploadCount = 0;

    for (const { form, validation } of validationResults) {
      if (!form.form_name) continue;

      // Check duplicates
      const formNum = form.form_number?.toUpperCase()?.trim();
      const formName = form.form_name?.toLowerCase()?.trim();

      if ((formNum && existingSet.has(formNum)) || (formName && existingSet.has(formName))) {
        duplicatesSkipped.push(form.form_number || form.form_name);
        continue;
      }

      // Add to existing set to prevent duplicates within this batch
      if (formNum) existingSet.add(formNum);
      if (formName) existingSet.add(formName);

      const pdfValid = validation.valid;

      // ALL forms get inserted - workflow_status indicates if PDF needs upload
      // 'staging' = PDF available, ready for processing
      // 'needs_upload' = form required but PDF must be manually uploaded
      const workflowStatus = pdfValid ? "staging" : "needs_upload";

      if (pdfValid) {
        validPdfCount++;
      } else {
        needsUploadCount++;
      }

      // Normalize category
      let category = form.category?.toLowerCase() || "deal";
      if (!["deal", "title", "tax", "compliance", "financing"].includes(category)) {
        category = "deal";
      }

      formsToInsert.push({
        // Core fields
        form_number: formNum || null,
        form_name: form.form_name.trim(),
        state: stateUpper,
        source_url: form.source_url || null,
        category: category,
        description: form.description || null,

        // Status tracking
        workflow_status: workflowStatus,
        pdf_validated: pdfValid,

        // AI metadata
        ai_discovered: true,
        last_verified: new Date().toISOString(),

        // Extended fields (will be ignored if columns don't exist)
        issuing_authority: form.issuing_authority || null,
        required_for: form.required_for || null,
        frequency: form.frequency || null,

        // Dealer association
        ...(dealer_id ? { dealer_id } : {}),
      });
    }

    console.log(`[${stateUpper}] Inserting ${formsToInsert.length} forms...`);

    // Insert in batches to handle potential column mismatches
    let insertedCount = 0;
    let insertErrors: string[] = [];

    if (formsToInsert.length > 0) {
      // Try full insert first
      const { data, error } = await supabase
        .from("form_staging")
        .insert(formsToInsert)
        .select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // If error mentions a column, try inserting with minimal fields
        if (error.message.includes("column") || error.message.includes("violates")) {
          console.log(`[${stateUpper}] Retrying with minimal fields...`);

          const minimalForms = formsToInsert.map(f => ({
            form_number: f.form_number,
            form_name: f.form_name,
            state: f.state,
            source_url: f.source_url,
            category: f.category,
            description: f.description,
            workflow_status: "staging", // Use safe default
            pdf_validated: f.pdf_validated,
            ai_discovered: true,
            ...(dealer_id ? { dealer_id } : {}),
          }));

          const { data: retryData, error: retryError } = await supabase
            .from("form_staging")
            .insert(minimalForms)
            .select("id");

          if (retryError) {
            insertErrors.push(retryError.message);
            console.error(`[${stateUpper}] Retry failed:`, retryError.message);
          } else {
            insertedCount = retryData?.length || 0;
          }
        } else {
          insertErrors.push(error.message);
        }
      } else {
        insertedCount = data?.length || 0;
      }
    }

    console.log(`[${stateUpper}] Complete: ${insertedCount} inserted, ${duplicatesSkipped.length} duplicates`);

    // Build response
    const formsList = formsToInsert.map(f => ({
      form_name: f.form_name,
      form_number: f.form_number,
      category: f.category,
      status: f.workflow_status,
      pdf_available: f.pdf_validated,
      source_url: f.source_url,
      description: f.description,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        message: `Found ${forms.length} required forms for ${stateUpper}. ${insertedCount} added (${validPdfCount} with PDF, ${needsUploadCount} need upload). ${duplicatesSkipped.length} duplicates skipped.`,

        // Summary counts
        total_discovered: forms.length,
        forms_inserted: insertedCount,
        forms_with_pdf: validPdfCount,
        forms_need_upload: needsUploadCount,
        duplicates_skipped: duplicatesSkipped.length,

        // Detailed lists
        forms: formsList,

        // Errors if any
        ...(insertErrors.length > 0 ? { errors: insertErrors } : {}),
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
