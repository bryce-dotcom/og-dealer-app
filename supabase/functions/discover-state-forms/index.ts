import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// BASELINE FORMS - every dealer needs these (will be customized by state)
const baselineForms = [
  // DEAL DOCUMENTS
  { form_name: "Bill of Sale", category: "deal", description: "Documents the sale transaction between dealer and buyer" },
  { form_name: "Buyers Order", category: "deal", description: "Purchase agreement showing vehicle details, price, fees, and terms" },
  { form_name: "Odometer Disclosure Statement", category: "deal", description: "Federal requirement to disclose accurate mileage on all vehicle sales", form_number: "FEDERAL" },
  { form_name: "FTC Buyers Guide", category: "deal", description: "Federal requirement - must be displayed on all used vehicles for sale", form_number: "FEDERAL" },
  { form_name: "As-Is No Warranty Disclosure", category: "deal", description: "Discloses vehicle is sold without warranty" },
  { form_name: "We-Owe / Due Bill", category: "deal", description: "Documents any items owed to buyer after sale" },
  { form_name: "Vehicle Delivery Receipt", category: "deal", description: "Confirms buyer received the vehicle" },
  { form_name: "Vehicle Condition Report", category: "deal", description: "Documents condition of vehicle at time of sale" },

  // TITLE & REGISTRATION
  { form_name: "Title Application", category: "title", description: "Application to transfer or obtain vehicle title" },
  { form_name: "Dealer Report of Sale", category: "title", description: "Notifies state of vehicle sale by dealer" },
  { form_name: "Power of Attorney for Title", category: "title", description: "Authorizes dealer to sign title documents on behalf of buyer" },
  { form_name: "Secure Power of Attorney", category: "title", description: "Odometer-specific POA for title transfers" },
  { form_name: "Lien Release", category: "title", description: "Releases existing lien on vehicle title" },
  { form_name: "Duplicate Title Request", category: "title", description: "Request for replacement title" },
  { form_name: "Temporary Permit", category: "title", description: "Temporary tag/permit while registration is processed" },
  { form_name: "VIN Verification", category: "title", description: "Verifies vehicle identification number matches records" },

  // FINANCING / BHPH
  { form_name: "Retail Installment Contract", category: "financing", description: "Finance agreement for vehicle purchase with payment terms" },
  { form_name: "Motor Vehicle Contract of Sale", category: "financing", description: "Contract for financed vehicle purchase" },
  { form_name: "Security Agreement", category: "financing", description: "Establishes lien on vehicle for financed purchases" },
  { form_name: "Truth in Lending Disclosure", category: "financing", description: "Federal Reg Z disclosure of APR, finance charges, and payment terms", form_number: "FEDERAL" },
  { form_name: "Credit Application", category: "financing", description: "Application for vehicle financing" },
  { form_name: "Privacy Notice", category: "financing", description: "Federal GLBA privacy disclosure for financial transactions", form_number: "FEDERAL" },
  { form_name: "Right to Cure Default Notice", category: "financing", description: "Notice to buyer of default and right to cure before repossession" },
  { form_name: "Notice of Intent to Repossess", category: "financing", description: "Legal notice before vehicle repossession" },
  { form_name: "GAP Waiver Agreement", category: "financing", description: "Guaranteed Asset Protection waiver agreement" },
  { form_name: "Payment Schedule", category: "financing", description: "Amortization schedule showing all payments" },
  { form_name: "Arbitration Agreement", category: "financing", description: "Agreement to arbitrate disputes" },

  // TAX
  { form_name: "Sales Tax Return", category: "tax", description: "Monthly/quarterly sales tax filing" },
  { form_name: "Sales Tax Exemption Certificate", category: "tax", description: "Certificate for tax-exempt purchases" },
  { form_name: "Resale Certificate", category: "tax", description: "Certificate for dealer-to-dealer sales without tax" },

  // DISCLOSURES
  { form_name: "Damage Disclosure Statement", category: "disclosure", description: "Discloses known damage to vehicle" },
  { form_name: "Salvage Title Disclosure", category: "disclosure", description: "Discloses if vehicle has salvage title history" },
  { form_name: "Rebuilt Title Disclosure", category: "disclosure", description: "Discloses if vehicle has rebuilt/reconstructed title" },
  { form_name: "Frame Damage Disclosure", category: "disclosure", description: "Discloses structural/frame damage" },
  { form_name: "Flood Damage Disclosure", category: "disclosure", description: "Discloses flood damage history" },
  { form_name: "Accident History Disclosure", category: "disclosure", description: "Discloses known accident history" },

  // COMPLIANCE
  { form_name: "Dealer License Application", category: "compliance", description: "Application for dealer license" },
  { form_name: "Dealer License Renewal", category: "compliance", description: "Annual dealer license renewal" },
  { form_name: "Surety Bond", category: "compliance", description: "Required dealer bond" },
  { form_name: "Consignment Agreement", category: "compliance", description: "Agreement to sell vehicle on consignment" },
];

// State resources
const stateResources: Record<string, { dmv: string; tax: string; forms: string }> = {
  UT: { dmv: "https://dmv.utah.gov", tax: "https://tax.utah.gov", forms: "https://dmv.utah.gov/vehicles/dealers" },
  TX: { dmv: "https://www.txdmv.gov", tax: "https://comptroller.texas.gov", forms: "https://www.txdmv.gov/forms" },
  CA: { dmv: "https://www.dmv.ca.gov", tax: "https://www.cdtfa.ca.gov", forms: "https://www.dmv.ca.gov/portal/forms/" },
  FL: { dmv: "https://www.flhsmv.gov", tax: "https://floridarevenue.com", forms: "https://www.flhsmv.gov/pdf/forms/" },
  AZ: { dmv: "https://azdot.gov/mvd", tax: "https://azdor.gov", forms: "https://azdot.gov/mvd/forms" },
  CO: { dmv: "https://dmv.colorado.gov", tax: "https://tax.colorado.gov", forms: "https://dmv.colorado.gov/forms" },
  NV: { dmv: "https://dmv.nv.gov", tax: "https://tax.nv.gov", forms: "https://dmv.nv.gov/forms.htm" },
  ID: { dmv: "https://itd.idaho.gov/dmv", tax: "https://tax.idaho.gov", forms: "https://itd.idaho.gov/dmv/" },
};

// Validate URL
async function checkUrl(url: string): Promise<{ url: string; valid: boolean; status: number | string }> {
  if (!url) return { url, valid: false, status: "no_url" };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(timeout);
    return { url, valid: res.ok, status: res.status };
  } catch (err) {
    return { url, valid: false, status: err.name === 'AbortError' ? 'timeout' : 'error' };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { state, dealer_id, clear_existing } = await req.json();
    if (!state) throw new Error("State is required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("Missing Anthropic API key");

    const stateUpper = state.toUpperCase();
    const stateLower = state.toLowerCase();
    const resources = stateResources[stateUpper] || {
      dmv: `https://dmv.${stateLower}.gov`,
      tax: `https://tax.${stateLower}.gov`,
      forms: `https://dmv.${stateLower}.gov/forms`
    };

    // Option to clear existing forms for this state first
    if (clear_existing) {
      console.log(`[${stateUpper}] Clearing existing forms...`);
      await supabase.from("form_staging").delete().eq("state", stateUpper);
    }

    // Get existing forms
    const { data: existing } = await supabase
      .from("form_staging")
      .select("form_number, form_name")
      .eq("state", stateUpper);

    const existingNames = new Set(existing?.map(f => f.form_name?.toLowerCase()).filter(Boolean) || []);

    console.log(`[${stateUpper}] Existing forms: ${existingNames.size}`);
    console.log(`[${stateUpper}] Baseline forms: ${baselineForms.length}`);

    // Ask AI ONLY for state-specific form numbers and URLs for our baseline forms
    const formNamesForAI = baselineForms.map(f => f.form_name).join('\n- ');

    const aiPrompt = `For ${stateUpper}, provide the official STATE FORM NUMBERS and PDF URLs for these dealer forms:

${formNamesForAI}

Return a JSON object mapping each form name to its ${stateUpper}-specific details:

{
  "Bill of Sale": {
    "form_number": "TC-891",
    "source_urls": ["https://dmv.utah.gov/forms/tc-891.pdf", "https://tax.utah.gov/forms/tc-891.pdf"]
  },
  "Title Application": {
    "form_number": "TC-656",
    "source_urls": ["https://dmv.utah.gov/forms/tc-656.pdf"]
  },
  "Odometer Disclosure Statement": {
    "form_number": "TC-891",
    "source_urls": ["https://dmv.utah.gov/forms/tc-891.pdf"]
  }
}

IMPORTANT:
- Use actual ${stateUpper} form numbers (like TC-69, TC-656, TC-891 for Utah)
- Include multiple possible URLs from: ${resources.dmv}, ${resources.tax}
- If form is federal only (FTC Buyers Guide, TILA), use "FEDERAL" and federal URLs
- If you don't know the form number, use null
- If you don't know any URLs, use empty array []

Return ONLY the JSON object. No markdown.`;

    console.log(`[${stateUpper}] Asking AI for state-specific form numbers and URLs...`);

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text || "{}";

    // Parse AI response
    let stateFormInfo: Record<string, { form_number?: string; source_urls?: string[] }> = {};
    try {
      let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) cleaned = match[0];
      stateFormInfo = JSON.parse(cleaned);
    } catch {
      console.error(`[${stateUpper}] Failed to parse AI response, using baseline only`);
      stateFormInfo = {};
    }

    console.log(`[${stateUpper}] AI provided info for ${Object.keys(stateFormInfo).length} forms`);

    // Collect all URLs for validation
    const allUrls: { formName: string; url: string }[] = [];
    for (const [formName, info] of Object.entries(stateFormInfo)) {
      if (info.source_urls && Array.isArray(info.source_urls)) {
        for (const url of info.source_urls) {
          if (typeof url === 'string' && url.length > 0) {
            allUrls.push({ formName, url });
          }
        }
      }
    }

    console.log(`[${stateUpper}] Validating ${allUrls.length} URLs...`);

    // Validate URLs in parallel
    const urlResults = await Promise.all(allUrls.map(({ url }) => checkUrl(url)));

    // Group URL results by form name
    const urlsByForm: Map<string, Array<{ url: string; valid: boolean; status: number | string }>> = new Map();
    for (let i = 0; i < allUrls.length; i++) {
      const { formName } = allUrls[i];
      if (!urlsByForm.has(formName)) urlsByForm.set(formName, []);
      urlsByForm.get(formName)!.push(urlResults[i]);
    }

    // Build final form list
    const toInsert: any[] = [];
    let skippedCount = 0;
    let totalUrlsWorking = 0;

    for (const baseForm of baselineForms) {
      // Skip if already exists
      if (existingNames.has(baseForm.form_name.toLowerCase())) {
        skippedCount++;
        continue;
      }

      // Get state-specific info from AI
      const stateInfo = stateFormInfo[baseForm.form_name] || {};
      const formUrls = urlsByForm.get(baseForm.form_name) || [];

      // Find working URL
      const workingUrl = formUrls.find(u => u.valid);
      if (workingUrl) totalUrlsWorking++;

      // Build alternate_urls
      const alternateUrls = formUrls.length > 0 ? formUrls.map(u => ({
        url: u.url,
        status: u.status,
        valid: u.valid
      })) : null;

      toInsert.push({
        form_number: stateInfo.form_number || baseForm.form_number || null,
        form_name: baseForm.form_name,
        state: stateUpper,
        source_url: workingUrl?.url || formUrls[0]?.url || null,
        category: baseForm.category,
        description: baseForm.description,
        workflow_status: "staging",
        pdf_validated: !!workingUrl,
        ai_discovered: true,
        alternate_urls: alternateUrls,
        ...(dealer_id ? { dealer_id } : {}),
      });
    }

    console.log(`[${stateUpper}] Inserting ${toInsert.length} forms (${skippedCount} already existed)...`);

    // Insert forms
    let insertedCount = 0;
    let insertError: string | null = null;

    if (toInsert.length > 0) {
      const { data, error } = await supabase.from("form_staging").insert(toInsert).select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // Fallback without optional columns
        if (error.message.includes("column")) {
          const fallbackInsert = toInsert.map(({ alternate_urls, ...rest }) => rest);
          const { data: retryData, error: retryError } = await supabase.from("form_staging").insert(fallbackInsert).select("id");

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

    console.log(`[${stateUpper}] Done: ${insertedCount} inserted, ${skippedCount} skipped (duplicates)`);

    // Count by category
    const byCategory: Record<string, number> = {};
    for (const form of toInsert) {
      byCategory[form.category] = (byCategory[form.category] || 0) + 1;
    }

    // Build response
    const formsList = toInsert.map(f => ({
      form_name: f.form_name,
      form_number: f.form_number,
      category: f.category,
      description: f.description,
      source_url: f.source_url,
      pdf_validated: f.pdf_validated,
      all_urls: f.alternate_urls,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,

        // Summary
        baseline_forms: baselineForms.length,
        total_inserted: insertedCount,
        already_existed: skippedCount,
        urls_working: totalUrlsWorking,

        // By category
        forms_by_category: byCategory,

        // State resources
        state_resources: resources,

        // Full form list
        forms: formsList,

        ...(insertError ? { insert_error: insertError } : {}),
        message: `${insertedCount} forms added for ${stateUpper}. ${skippedCount} already existed. ${totalUrlsWorking} URLs validated.`
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
