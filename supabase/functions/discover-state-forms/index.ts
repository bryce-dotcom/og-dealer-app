import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State resource links
const stateResources: Record<string, { dmv: string; tax: string; forms: string }> = {
  UT: { dmv: "https://dmv.utah.gov", tax: "https://tax.utah.gov", forms: "https://dmv.utah.gov/vehicles/dealers" },
  TX: { dmv: "https://www.txdmv.gov", tax: "https://comptroller.texas.gov", forms: "https://www.txdmv.gov/motorists/buying-or-selling-a-vehicle" },
  CA: { dmv: "https://www.dmv.ca.gov", tax: "https://www.cdtfa.ca.gov", forms: "https://www.dmv.ca.gov/portal/vehicle-industry-services/" },
  FL: { dmv: "https://www.flhsmv.gov", tax: "https://floridarevenue.com", forms: "https://www.flhsmv.gov/motor-vehicles-tags-titles/" },
  AZ: { dmv: "https://azdot.gov/mvd", tax: "https://azdor.gov", forms: "https://azdot.gov/motor-vehicles/vehicle-services" },
  CO: { dmv: "https://dmv.colorado.gov", tax: "https://tax.colorado.gov", forms: "https://dmv.colorado.gov/dealer-services" },
  NV: { dmv: "https://dmv.nv.gov", tax: "https://tax.nv.gov", forms: "https://dmv.nv.gov/dealer.htm" },
  ID: { dmv: "https://itd.idaho.gov/dmv", tax: "https://tax.idaho.gov", forms: "https://itd.idaho.gov/dmv/vehicles/" },
};

// Validate URL and return status
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
    const { state, dealer_id } = await req.json();
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

    // Get existing forms
    const { data: existing } = await supabase
      .from("form_staging")
      .select("form_number, form_name")
      .eq("state", stateUpper);

    const existingKeys = new Set([
      ...(existing?.map(f => f.form_number?.toUpperCase()).filter(Boolean) || []),
      ...(existing?.map(f => f.form_name?.toLowerCase()).filter(Boolean) || [])
    ]);

    console.log(`[${stateUpper}] Discovering forms...`);

    // EXPLICIT AI PROMPT - demand 20+ forms
    const systemPrompt = `You are a compliance expert for used car dealerships in ${stateUpper}.

List EVERY form required to operate a used car dealership and complete vehicle sales.

YOU MUST RETURN AT LEAST 20 FORMS. This is critical - dealerships need many forms.

REQUIRED CATEGORIES - include forms from EACH category:

1. DEAL DOCUMENTS (minimum 6 forms):
   - Bill of Sale (state-specific)
   - Buyers Order / Purchase Agreement
   - Odometer Disclosure Statement (FEDERAL - required on ALL sales)
   - FTC Buyers Guide / As-Is Disclosure (FEDERAL - required on ALL used cars)
   - We-Owe / Due Bill
   - Delivery Receipt / Acknowledgment
   - Vehicle Condition Report

2. TITLE & REGISTRATION (minimum 5 forms):
   - Title Application / Transfer
   - Dealer Report of Sale
   - Power of Attorney for Title
   - Lien Release / Satisfaction of Lien
   - Duplicate Title Request
   - Temporary Permit / Temp Tags
   - VIN Verification / Inspection

3. FINANCING / BHPH (minimum 6 forms):
   - Retail Installment Contract / Motor Vehicle Contract of Sale
   - Security Agreement
   - Truth in Lending Disclosure (FEDERAL Reg Z)
   - Right to Cure Default Notice
   - Notice of Intent to Repossess
   - Credit Application
   - Privacy Notice (FEDERAL GLBA)
   - GAP Waiver Agreement
   - Arbitration Agreement

4. TAX (minimum 2 forms):
   - Sales and Use Tax Return
   - Tax Exemption Certificate
   - Resale Certificate

5. DISCLOSURES (minimum 4 forms):
   - Damage Disclosure Statement
   - Salvage Title Disclosure
   - Rebuilt/Reconstructed Title Disclosure
   - Frame Damage Disclosure
   - Flood Damage Disclosure
   - Lemon Law Disclosure (if applicable)

6. COMPLIANCE (minimum 2 forms):
   - Dealer License Application/Renewal
   - Surety Bond

For source_urls, search these ${stateUpper} government websites:
- ${resources.dmv}
- ${resources.tax}
- ${stateUpper.toLowerCase()}.gov
- dps.${stateLower}.gov
- dot.${stateLower}.gov

Return ONLY a valid JSON array. No markdown code blocks. No explanations.
MINIMUM 20 FORMS REQUIRED.`;

    const userPrompt = `List ALL forms for ${stateUpper} used car dealers. Return JSON array:

[
  {
    "form_name": "Bill of Sale",
    "form_number": "TC-891",
    "category": "deal",
    "description": "Required for all vehicle sales to document the transaction",
    "required": true,
    "source_urls": [
      "https://dmv.utah.gov/forms/tc-891.pdf",
      "https://tax.utah.gov/forms/current/tc-891.pdf"
    ]
  },
  {
    "form_name": "Odometer Disclosure Statement",
    "form_number": "FEDERAL",
    "category": "deal",
    "description": "Federal requirement for all motor vehicle transfers",
    "required": true,
    "source_urls": ["https://www.nhtsa.gov/document/odometer-disclosure"]
  }
]

CHECKLIST - You MUST include ALL of these:

DEAL DOCUMENTS (6+):
☐ Bill of Sale
☐ Buyers Order / Purchase Agreement
☐ Odometer Disclosure (FEDERAL)
☐ FTC Buyers Guide (FEDERAL)
☐ We-Owe / Due Bill
☐ Delivery Receipt

TITLE & REGISTRATION (5+):
☐ Title Application
☐ Dealer Report of Sale
☐ Power of Attorney
☐ Lien Release
☐ Temporary Permit

FINANCING / BHPH (6+):
☐ Retail Installment Contract
☐ Security Agreement
☐ Truth in Lending (FEDERAL)
☐ Right to Cure Notice
☐ Credit Application
☐ Privacy Notice (FEDERAL)

TAX (2+):
☐ Sales Tax Return
☐ Exemption Certificate

DISCLOSURES (4+):
☐ Damage Disclosure
☐ Salvage Title Disclosure
☐ Rebuilt Title Disclosure
☐ Frame Damage Disclosure

COMPLIANCE (2+):
☐ Dealer License
☐ Surety Bond

RETURN MINIMUM 20 FORMS. Include state-specific form numbers where applicable. For federal forms, use "FEDERAL" as form_number.

Return the JSON array now:`;

    console.log(`[${stateUpper}] Calling AI (expecting 20+ forms)...`);

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
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
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
      console.error(`[${stateUpper}] Parse error:`, content.substring(0, 500));
      throw new Error("Failed to parse AI response");
    }

    const aiReturnedCount = forms.length;
    console.log(`[${stateUpper}] AI returned ${aiReturnedCount} forms`);

    if (aiReturnedCount < 10) {
      console.warn(`[${stateUpper}] WARNING: AI only returned ${aiReturnedCount} forms (expected 20+)`);
    }

    // Collect ALL URLs for parallel validation
    const allUrls: { formIndex: number; url: string }[] = [];
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      let urls: string[] = [];
      if (Array.isArray(form.source_urls)) {
        urls = form.source_urls.filter((u: any) => typeof u === 'string' && u.length > 0);
      } else if (form.source_url && typeof form.source_url === 'string') {
        urls = [form.source_url];
      }
      for (const url of urls) {
        allUrls.push({ formIndex: i, url });
      }
    }

    console.log(`[${stateUpper}] Validating ${allUrls.length} URLs...`);

    // Validate all URLs in parallel
    const urlResults = await Promise.all(allUrls.map(({ url }) => checkUrl(url)));

    // Group results by form
    const urlsByForm: Map<number, Array<{ url: string; valid: boolean; status: number | string }>> = new Map();
    for (let i = 0; i < allUrls.length; i++) {
      const { formIndex } = allUrls[i];
      if (!urlsByForm.has(formIndex)) urlsByForm.set(formIndex, []);
      urlsByForm.get(formIndex)!.push(urlResults[i]);
    }

    // Build insert list
    const toInsert: any[] = [];
    const duplicates: string[] = [];
    let totalUrlsValidated = 0;
    let totalUrlsWorking = 0;

    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      if (!form.form_name) continue;

      const formNum = form.form_number?.toString().toUpperCase().trim() || null;
      const formName = form.form_name.toLowerCase().trim();

      // Skip duplicates
      if ((formNum && existingKeys.has(formNum)) || existingKeys.has(formName)) {
        duplicates.push(formNum || form.form_name);
        continue;
      }
      if (formNum) existingKeys.add(formNum);
      existingKeys.add(formName);

      // Get URL results
      const formUrls = urlsByForm.get(i) || [];
      totalUrlsValidated += formUrls.length;

      const workingUrl = formUrls.find(u => u.valid);
      const hasWorkingUrl = !!workingUrl;
      if (hasWorkingUrl) totalUrlsWorking++;

      const alternateUrls = formUrls.map(u => ({ url: u.url, status: u.status, valid: u.valid }));

      // Normalize category
      let category = form.category?.toLowerCase() || "deal";
      const validCategories = ["deal", "title", "financing", "tax", "disclosure", "compliance"];
      if (!validCategories.includes(category)) category = "deal";

      toInsert.push({
        form_number: formNum,
        form_name: form.form_name.trim(),
        state: stateUpper,
        source_url: workingUrl?.url || formUrls[0]?.url || null,
        category,
        description: form.description || null,
        workflow_status: "staging",
        pdf_validated: hasWorkingUrl,
        ai_discovered: true,
        required_for: form.required === false ? ["optional"] : ["all_deals"],
        alternate_urls: alternateUrls.length > 0 ? alternateUrls : null,
        ...(dealer_id ? { dealer_id } : {}),
      });
    }

    console.log(`[${stateUpper}] Inserting ${toInsert.length} forms...`);
    console.log(`[${stateUpper}] URLs: ${totalUrlsValidated} checked, ${totalUrlsWorking} working`);

    // Insert all forms
    let insertedCount = 0;
    let insertError: string | null = null;

    if (toInsert.length > 0) {
      const { data, error } = await supabase.from("form_staging").insert(toInsert).select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // Fallback without optional columns
        if (error.message.includes("column")) {
          console.log(`[${stateUpper}] Retrying without optional columns...`);
          const fallbackInsert = toInsert.map(({ required_for, alternate_urls, ...rest }) => rest);
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

    console.log(`[${stateUpper}] Done: ${insertedCount} inserted`);

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
        ai_returned: aiReturnedCount,
        total_inserted: insertedCount,
        duplicates_skipped: duplicates.length,
        urls_checked: totalUrlsValidated,
        urls_working: totalUrlsWorking,

        // By category
        forms_by_category: byCategory,

        // State resources
        state_resources: resources,

        // Full form list
        forms: formsList,

        ...(insertError ? { insert_error: insertError } : {}),
        message: `Found ${aiReturnedCount} forms for ${stateUpper}. ${insertedCount} added. ${totalUrlsWorking}/${totalUrlsValidated} URLs valid.`
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
