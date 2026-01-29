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
const stateAgencies: Record<string, { dmv: string; tax: string; mved: string }> = {
  UT: {
    dmv: "Utah Division of Motor Vehicles (DMV)",
    tax: "Utah State Tax Commission",
    mved: "Utah Motor Vehicle Enforcement Division (MVED)"
  },
  TX: {
    dmv: "Texas Department of Motor Vehicles (TxDMV)",
    tax: "Texas Comptroller of Public Accounts",
    mved: "Texas DMV Motor Vehicle Division"
  },
  CA: {
    dmv: "California Department of Motor Vehicles (DMV)",
    tax: "California Department of Tax and Fee Administration (CDTFA)",
    mved: "DMV Occupational Licensing"
  },
  FL: {
    dmv: "Florida Department of Highway Safety and Motor Vehicles (FLHSMV)",
    tax: "Florida Department of Revenue",
    mved: "FLHSMV Dealer Services"
  },
  AZ: {
    dmv: "Arizona Department of Transportation Motor Vehicle Division",
    tax: "Arizona Department of Revenue",
    mved: "Arizona Dealer Licensing Unit"
  },
  CO: {
    dmv: "Colorado Division of Motor Vehicles",
    tax: "Colorado Department of Revenue",
    mved: "Colorado Auto Industry Division"
  },
  NV: {
    dmv: "Nevada Department of Motor Vehicles",
    tax: "Nevada Department of Taxation",
    mved: "Nevada DMV Compliance Enforcement"
  },
};

// Known state forms pages for URL construction
const stateFormsPages: Record<string, string> = {
  UT: "https://dmv.utah.gov/forms",
  TX: "https://www.txdmv.gov/forms",
  CA: "https://www.dmv.ca.gov/portal/forms",
  FL: "https://www.flhsmv.gov/resources/forms",
  AZ: "https://azdot.gov/motor-vehicles/vehicle-services/forms",
  CO: "https://dmv.colorado.gov/forms-documents",
  NV: "https://dmv.nv.gov/forms.htm",
  GA: "https://dor.georgia.gov/motor-vehicle-forms",
  NC: "https://www.ncdot.gov/dmv/title-registration/Pages/forms.aspx",
  OH: "https://bmv.ohio.gov/forms.aspx",
};

// Validate PDF URL with HEAD request (5 second timeout for parallel)
async function validatePdfUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('pdf') || contentType.includes('octet-stream') || response.status === 200) {
        return { valid: true };
      }
      return { valid: false, error: `Invalid content-type: ${contentType}` };
    }

    return { valid: false, error: `HTTP ${response.status}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Timeout' };
    }
    return { valid: false, error: err.message || 'Network error' };
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
      mved: `${stateUpper} Motor Vehicle Enforcement Division`
    };
    const formsPage = stateFormsPages[stateUpper] || `https://dmv.${state.toLowerCase()}.gov/forms`;

    // Check existing forms to track duplicates
    const { data: existingForms } = await supabase
      .from("form_staging")
      .select("form_number, form_name")
      .eq("state", stateUpper);

    const existingFormNumbers = new Set(existingForms?.map((f) => f.form_number?.toUpperCase()) || []);
    const existingFormNames = new Set(existingForms?.map((f) => f.form_name?.toLowerCase()) || []);

    console.log(`[${stateUpper}] Starting comprehensive form discovery...`);
    console.log(`[${stateUpper}] Existing forms: ${existingFormNumbers.size}`);

    // ========================================
    // PHASE 1: COMPREHENSIVE RESEARCH
    // ========================================

    const systemPrompt = `You are an expert compliance researcher for automotive dealerships. You have deep knowledge of state-specific DMV, tax, and dealer licensing requirements.

Your task: Provide a COMPREHENSIVE list of ALL forms, documents, and reports required for a used car dealer operating in ${stateUpper}.

State agencies to consider:
- ${agencies.dmv}
- ${agencies.tax}
- ${agencies.mved}
- Federal Trade Commission (FTC)
- Federal Odometer Act requirements

CRITICAL: Be thorough. A dealer needs forms for:
1. EVERY vehicle sale (title transfer, registration, bill of sale)
2. Tax compliance (sales tax returns, exemption certificates)
3. Dealer licensing (license renewal, bonds, permits)
4. Federal requirements (odometer disclosure, FTC Buyers Guide)
5. Financing/BHPH (if offering in-house financing)
6. Trade-ins and wholesale transactions
7. Temporary permits and dealer plates
8. Monthly/quarterly/annual reporting

For source_url, use REAL URLs from official .gov websites. Common patterns:
- Utah: https://dmv.utah.gov/forms/tc-XXX.pdf or https://tax.utah.gov/forms/tc-XXX.pdf
- Texas: https://www.txdmv.gov/sites/default/files/form_files/XXX.pdf
- California: https://www.dmv.ca.gov/portal/file/XXX-pdf/
- Florida: https://www.flhsmv.gov/pdf/forms/XXXXX.pdf

If you don't know the exact PDF URL, set source_url to null - do NOT guess.

Return ONLY a valid JSON array with NO markdown formatting.`;

    const userPrompt = `List EVERY form, document, and report required for a used car dealer in ${stateUpper}.

Include ALL of these categories:

1. DMV/TITLE FORMS:
   - Title application/transfer forms
   - Registration forms
   - Temporary permit applications
   - Dealer plate applications
   - Lien release forms
   - Power of attorney forms
   - Duplicate title requests

2. TAX FORMS:
   - Sales and use tax returns (monthly/quarterly)
   - Tax exemption certificates
   - Dealer tax reporting forms
   - Trade-in credit forms

3. DEAL PAPERWORK (per transaction):
   - Bill of Sale
   - Buyer's Order / Purchase Agreement
   - Odometer Disclosure Statement (federal requirement)
   - FTC Buyers Guide (federal - required on ALL used vehicles)
   - As-Is / No Warranty Disclosure
   - Motor Vehicle Contract of Sale
   - Delivery Receipt
   - Secure Power of Attorney

4. DEALER LICENSING/COMPLIANCE:
   - Dealer license application/renewal
   - Surety bond forms
   - Business license requirements
   - Garage liability insurance forms
   - Salesperson license forms

5. BHPH/FINANCING FORMS (if dealer does in-house financing):
   - Retail Installment Contract
   - Truth in Lending Disclosure
   - Privacy Notice
   - GAP Agreement forms
   - Repossession notices

6. REPORTING REQUIREMENTS:
   - Monthly sales reports to DMV
   - Title submission deadlines
   - Tax filing deadlines
   - Annual dealer license renewal

Return as JSON array with this EXACT structure for each item:
{
  "form_name": "Official form name",
  "form_number": "TC-69" or null if no number,
  "issuing_authority": "Utah DMV" | "Utah Tax Commission" | "FTC" | "Federal" | etc,
  "category": "deal" | "title" | "tax" | "compliance" | "financing" | "reporting",
  "description": "What this form is used for",
  "required_for": ["cash_deal", "bhph_deal", "trade_in", "monthly_reporting", "license_renewal"],
  "frequency": "per_deal" | "monthly" | "quarterly" | "annually" | "as_needed",
  "source_url": "https://exact.gov.url/to/form.pdf" or null,
  "deadline_info": "Due by 25th of following month" or null
}

Be comprehensive - a typical state has 20-40 required forms/documents.`;

    console.log(`[${stateUpper}] Phase 1: Researching compliance requirements...`);

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
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "[]";

    // Parse JSON response
    let forms: any[] = [];
    try {
      let cleaned = content
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        cleaned = arrayMatch[0];
      }

      forms = JSON.parse(cleaned);
    } catch (parseError) {
      console.error(`[${stateUpper}] Failed to parse AI response:`, content.substring(0, 500));
      throw new Error("Failed to parse AI response as JSON");
    }

    if (!Array.isArray(forms)) {
      forms = [];
    }

    console.log(`[${stateUpper}] Phase 1 complete: Found ${forms.length} form requirements`);

    // ========================================
    // PHASE 2: VALIDATE AND CATEGORIZE
    // ========================================

    console.log(`[${stateUpper}] Phase 2: Validating URLs in parallel...`);

    // Prepare forms for validation
    const formsToProcess: { form: any; sourceUrl: string | null }[] = [];
    const skippedDuplicates: string[] = [];

    for (const form of forms) {
      // Skip if missing required fields
      if (!form.form_name) {
        continue;
      }

      // Check for duplicates by form number or name
      const formNumber = form.form_number?.toUpperCase()?.trim();
      const formName = form.form_name?.toLowerCase()?.trim();

      if (formNumber && existingFormNumbers.has(formNumber)) {
        skippedDuplicates.push(formNumber);
        continue;
      }
      if (formName && existingFormNames.has(formName)) {
        skippedDuplicates.push(form.form_name);
        continue;
      }

      formsToProcess.push({
        form,
        sourceUrl: form.source_url || null
      });
    }

    console.log(`[${stateUpper}] Processing ${formsToProcess.length} forms (${skippedDuplicates.length} duplicates skipped)`);

    // Validate all URLs in parallel
    const validationResults = await Promise.all(
      formsToProcess.map(async ({ form, sourceUrl }) => {
        let pdfValidated = false;
        let validationError: string | null = null;

        if (sourceUrl) {
          try {
            new URL(sourceUrl); // Validate URL format
            const validation = await validatePdfUrl(sourceUrl);
            pdfValidated = validation.valid;
            validationError = validation.error || null;
          } catch {
            validationError = "Invalid URL format";
          }
        }

        return { form, sourceUrl, pdfValidated, validationError };
      })
    );

    // ========================================
    // PHASE 3: INSERT TO DATABASE
    // ========================================

    console.log(`[${stateUpper}] Phase 3: Inserting forms to database...`);

    const formsToInsert: any[] = [];
    const formsWithValidPdf: any[] = [];
    const formsNeedingUpload: any[] = [];
    const reportingRequirements: any[] = [];

    for (const { form, sourceUrl, pdfValidated, validationError } of validationResults) {
      // Determine workflow status based on PDF validation
      const workflowStatus = pdfValidated ? "staging" : "needs_upload";

      // Map category from AI response
      let category = form.category || "deal";
      if (!["deal", "title", "tax", "compliance", "financing", "reporting"].includes(category)) {
        category = "deal";
      }

      // Build the form record
      const formRecord = {
        form_number: form.form_number?.toUpperCase()?.trim() || null,
        form_name: form.form_name.trim(),
        state: stateUpper,
        source_url: sourceUrl,
        category: category,
        description: form.description || null,

        // AI discovery metadata
        ai_discovered: true,
        last_verified: new Date().toISOString(),

        // Workflow status
        workflow_status: workflowStatus,

        // PDF validation
        pdf_validated: pdfValidated,

        // Extended metadata
        issuing_authority: form.issuing_authority || null,
        required_for: form.required_for || null,
        frequency: form.frequency || null,
        deadline_info: form.deadline_info || null,

        // Optional fields
        is_fillable: null,
        html_template_url: null,
        field_mapping: null,

        // Dealer association
        ...(dealer_id ? { dealer_id } : {}),
      };

      formsToInsert.push(formRecord);

      // Track for response
      const formSummary = {
        form_name: form.form_name,
        form_number: form.form_number || null,
        category: category,
        status: workflowStatus,
        source_url: sourceUrl,
        description: form.description,
        pdf_validated: pdfValidated,
        validation_error: validationError
      };

      if (pdfValidated) {
        formsWithValidPdf.push(formSummary);
      } else {
        formsNeedingUpload.push(formSummary);
      }

      // Extract reporting requirements
      if (category === "reporting" || form.frequency === "monthly" || form.frequency === "quarterly" || form.frequency === "annually") {
        reportingRequirements.push({
          name: form.form_name,
          form_number: form.form_number,
          frequency: form.frequency,
          deadline: form.deadline_info
        });
      }
    }

    // Insert all forms
    let insertedCount = 0;
    if (formsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("form_staging")
        .insert(formsToInsert)
        .select();

      if (insertError) {
        console.error(`[${stateUpper}] Insert error:`, insertError);
        throw new Error(`Failed to insert forms: ${insertError.message}`);
      }

      insertedCount = inserted?.length || 0;
    }

    console.log(`[${stateUpper}] Successfully inserted ${insertedCount} forms`);
    console.log(`[${stateUpper}] - With valid PDF: ${formsWithValidPdf.length}`);
    console.log(`[${stateUpper}] - Needing upload: ${formsNeedingUpload.length}`);

    // Log discovery results
    try {
      await supabase.from("form_discovery_log").insert({
        state: stateUpper,
        forms_found: forms.length,
        forms_added: insertedCount,
        forms_skipped: skippedDuplicates.length,
        skipped_details: skippedDuplicates,
        discovered_at: new Date().toISOString()
      });
    } catch (logErr) {
      console.log(`[${stateUpper}] Could not log to form_discovery_log`);
    }

    // ========================================
    // RESPONSE
    // ========================================

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        total_requirements_found: forms.length,
        forms_inserted: insertedCount,
        forms_with_valid_pdf: formsWithValidPdf.length,
        forms_needing_upload: formsNeedingUpload.length,
        duplicates_skipped: skippedDuplicates.length,
        forms: [...formsWithValidPdf, ...formsNeedingUpload],
        reporting_requirements: reportingRequirements,
        message: `Discovered ${forms.length} compliance requirements for ${stateUpper}. ${formsWithValidPdf.length} forms have accessible PDFs, ${formsNeedingUpload.length} need manual upload.`
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
