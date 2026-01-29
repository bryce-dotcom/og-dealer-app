import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State DMV base URLs
const stateDmvUrls: Record<string, string> = {
  AL: "https://revenue.alabama.gov/motor-vehicle/forms",
  AK: "https://doa.alaska.gov/dmv/forms",
  AZ: "https://azdot.gov/motor-vehicles/vehicle-services/forms",
  AR: "https://www.dfa.arkansas.gov/motor-vehicle/forms",
  CA: "https://www.dmv.ca.gov/portal/forms",
  CO: "https://dmv.colorado.gov/forms-documents",
  CT: "https://portal.ct.gov/dmv/forms",
  DE: "https://dmv.de.gov/forms",
  FL: "https://www.flhsmv.gov/resources/forms",
  GA: "https://dor.georgia.gov/motor-vehicle-forms",
  HI: "https://hidot.hawaii.gov/highways/vehicle-registration-licensing",
  ID: "https://itd.idaho.gov/dmv/forms",
  IL: "https://www.ilsos.gov/departments/vehicles/forms",
  IN: "https://www.in.gov/bmv/forms-documents",
  IA: "https://iowadot.gov/mvd/vehicleregistration/forms",
  KS: "https://www.ksrevenue.gov/dovforms.html",
  KY: "https://drive.ky.gov/motor-vehicle-licensing/Pages/Forms.aspx",
  LA: "https://expresslane.org/forms",
  ME: "https://www.maine.gov/sos/bmv/forms",
  MD: "https://mva.maryland.gov/Pages/forms.aspx",
  MA: "https://www.mass.gov/rmv-forms",
  MI: "https://www.michigan.gov/sos/resources/forms",
  MN: "https://dps.mn.gov/divisions/dvs/forms-documents",
  MS: "https://www.dor.ms.gov/motor-vehicle/forms",
  MO: "https://dor.mo.gov/motor-vehicle/forms",
  MT: "https://dojmt.gov/driving/vehicle-title-and-registration",
  NE: "https://dmv.nebraska.gov/dvr/forms",
  NV: "https://dmv.nv.gov/forms.htm",
  NH: "https://www.dmv.nh.gov/forms",
  NJ: "https://www.nj.gov/mvc/forms",
  NM: "https://www.mvd.newmexico.gov/forms",
  NY: "https://dmv.ny.gov/forms",
  NC: "https://www.ncdot.gov/dmv/title-registration/Pages/forms.aspx",
  ND: "https://dot.nd.gov/divisions/driverslicense/forms",
  OH: "https://bmv.ohio.gov/forms.aspx",
  OK: "https://oklahoma.gov/tax/motor-vehicle/forms.html",
  OR: "https://www.oregon.gov/odot/dmv/pages/form",
  PA: "https://www.dot.state.pa.us/public/dvspubsforms",
  RI: "https://dmv.ri.gov/registrations/forms",
  SC: "https://scdmvonline.com/Vehicle-Owners/Forms",
  SD: "https://dor.sd.gov/motor-vehicles/forms",
  TN: "https://www.tn.gov/revenue/title-and-registration/forms.html",
  TX: "https://www.txdmv.gov/forms",
  UT: "https://dmv.utah.gov/forms",
  VT: "https://dmv.vermont.gov/registrations/forms",
  VA: "https://www.dmv.virginia.gov/vehicles/forms.asp",
  WA: "https://www.dol.wa.gov/forms",
  WV: "https://transportation.wv.gov/DMV/Forms",
  WI: "https://wisconsindot.gov/Pages/dmv/forms",
  WY: "https://www.dot.state.wy.us/home/titles_plates_registration/forms.html",
  DC: "https://dmv.dc.gov/service/forms",
};

function getStateFormsUrl(state: string): string {
  return stateDmvUrls[state.toUpperCase()] || `https://dmv.${state.toLowerCase()}.gov/forms`;
}

// Validate PDF URL with HEAD request
async function validatePdfUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      // Check content type if available
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('pdf') || contentType.includes('octet-stream') || response.status === 200) {
        return { valid: true };
      }
      return { valid: false, error: `Invalid content-type: ${contentType}` };
    }

    return { valid: false, error: `HTTP ${response.status} ${response.statusText}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { valid: false, error: 'Request timeout (10s)' };
    }
    return { valid: false, error: err.message || 'Network error' };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, county, dealer_id } = await req.json();

    if (!state) {
      throw new Error("State is required");
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("Missing Anthropic API key");
    }

    const stateUpper = state.toUpperCase();
    const fallbackUrl = getStateFormsUrl(stateUpper);

    // Check existing forms to avoid duplicates
    const { data: existingForms } = await supabase
      .from("form_staging")
      .select("form_number")
      .eq("state", stateUpper);

    const existingFormNumbers = new Set(existingForms?.map((f) => f.form_number) || []);

    // AI prompt for form discovery
    const systemPrompt = `You are an expert on US state DMV forms and dealer compliance requirements.

Your task: Return a JSON array of official DMV/state forms required for auto dealers in the given state.

CRITICAL REQUIREMENTS:
1. Every form MUST have a source_url - use official state DMV/DOT/DOR website URLs
2. URLs must point to actual PDF files when possible (ending in .pdf)
3. If you don't know the exact PDF URL, use the state's main forms page: ${fallbackUrl}
4. Form numbers must be accurate and real
5. Categorize each form by doc_type

Response format - return ONLY valid JSON, no markdown:
[
  {
    "form_number": "TC-69",
    "form_name": "Application for Utah Title",
    "doc_type": "deal",
    "source_url": "https://dmv.utah.gov/forms/tc-69.pdf",
    "description": "Required for every vehicle sale to transfer title"
  }
]

doc_type values:
- deal: Forms needed per vehicle sale (title, registration, bill of sale, odometer)
- finance: BHPH/financing disclosures, loan agreements, truth in lending
- licensing: Dealer license renewal, surety bonds, business permits
- tax: Sales tax returns, use tax filings
- reporting: DMV reports, inventory reports

Only include forms you're confident exist with valid URLs.`;

    const userPrompt = `List ALL required forms for auto dealers in ${stateUpper}${county ? `, ${county} County` : ""}.

Include:
- Title application/transfer forms (per sale)
- Bill of Sale
- Odometer Disclosure Statement
- Buyer's Guide (FTC requirement)
- BHPH/Financing disclosure forms
- Sales tax forms
- Dealer license forms

For each form provide the exact PDF URL if known, otherwise use the state forms page URL.
Return ONLY the JSON array.`;

    console.log(`Discovering forms for ${stateUpper}...`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 4096,
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

    // Parse the JSON response
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
      console.error("Failed to parse AI response:", content);
      forms = [];
    }

    if (!Array.isArray(forms)) {
      forms = [];
    }

    console.log(`AI returned ${forms.length} forms, validating URLs in parallel...`);

    // Pre-process forms: filter duplicates and prepare URLs
    const formsToValidate: { form: any; sourceUrl: string }[] = [];
    const skippedForms: any[] = [];

    for (const form of forms) {
      // Skip if already exists
      if (existingFormNumbers.has(form.form_number)) {
        console.log(`Skipping duplicate: ${form.form_number}`);
        continue;
      }

      // Validate required fields
      if (!form.form_number || !form.form_name) {
        skippedForms.push({
          form_name: form.form_name || 'Unknown',
          url: form.source_url,
          reason: 'Missing form number or name'
        });
        continue;
      }

      // Get or generate URL
      let sourceUrl = form.source_url;
      if (!sourceUrl || sourceUrl.trim() === "") {
        const formSlug = form.form_number.toLowerCase().replace(/[^a-z0-9]/g, "-");
        sourceUrl = `${fallbackUrl}/${formSlug}.pdf`;
      }

      // Validate URL format
      try {
        new URL(sourceUrl);
      } catch {
        sourceUrl = fallbackUrl;
      }

      formsToValidate.push({ form, sourceUrl });
    }

    console.log(`Validating ${formsToValidate.length} form URLs in parallel...`);

    // PARALLEL URL validation - much faster than sequential
    const validationResults = await Promise.all(
      formsToValidate.map(async ({ form, sourceUrl }) => {
        const validation = await validatePdfUrl(sourceUrl);
        return { form, sourceUrl, validation };
      })
    );

    // Process validation results
    const validForms: any[] = [];
    let validatedCount = 0;
    let invalidCount = 0;

    for (const { form, sourceUrl, validation } of validationResults) {
      if (validation.valid) {
        validatedCount++;
        validForms.push({
          // Required fields
          form_number: form.form_number.toUpperCase().trim(),
          form_name: form.form_name.trim(),
          state: stateUpper,
          source_url: sourceUrl,

          // Category (maps from doc_type)
          category: form.doc_type || "deal",
          description: form.description || null,

          // AI discovery metadata
          ai_discovered: true,
          last_verified: new Date().toISOString(),

          // Workflow
          workflow_status: "staging",

          // PDF validation
          pdf_validated: true,

          // Optional - set to null/defaults
          is_fillable: null,
          required_for: null,
          html_template_url: null,
          field_mapping: null,

          // Include dealer_id if provided
          ...(dealer_id ? { dealer_id } : {}),
        });
        console.log(`✓ Valid: ${form.form_number}`);
      } else {
        invalidCount++;
        skippedForms.push({
          form_name: form.form_name,
          form_number: form.form_number,
          url: sourceUrl,
          reason: validation.error || 'URL not accessible'
        });
        console.log(`✗ Invalid: ${form.form_number} - ${validation.error}`);
      }
    }

    console.log(`Validation complete: ${validatedCount} valid, ${invalidCount} invalid`);

    // Insert valid forms into form_staging
    let insertedCount = 0;
    if (validForms.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("form_staging")
        .insert(validForms)
        .select();

      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error(`Failed to insert forms: ${insertError.message}`);
      }

      insertedCount = inserted?.length || 0;
      console.log(`Successfully inserted ${insertedCount} forms`);
    }

    // Log skipped forms for review
    if (skippedForms.length > 0) {
      console.log("Skipped forms:", JSON.stringify(skippedForms, null, 2));

      // Store skipped forms in discovery log for review
      try {
        await supabase.from("form_discovery_log").insert({
          state: stateUpper,
          forms_found: forms.length,
          forms_added: insertedCount,
          forms_skipped: skippedForms.length,
          skipped_details: skippedForms,
          discovered_at: new Date().toISOString()
        });
      } catch (logErr) {
        console.log("Could not log to form_discovery_log (table may not exist)");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        forms_found: forms.length,
        forms_added: insertedCount,
        forms_skipped: skippedForms.length,
        skipped_reasons: skippedForms.length > 0 ? skippedForms : undefined,
        message: `Found ${forms.length} forms, validated URLs. ${insertedCount} valid forms added, ${skippedForms.length} skipped due to broken links.`
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
