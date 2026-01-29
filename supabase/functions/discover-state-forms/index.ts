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
  UT: {
    dmv: "https://dmv.utah.gov",
    tax: "https://tax.utah.gov",
    forms: "https://dmv.utah.gov/vehicles/dealers"
  },
  TX: {
    dmv: "https://www.txdmv.gov",
    tax: "https://comptroller.texas.gov",
    forms: "https://www.txdmv.gov/motorists/buying-or-selling-a-vehicle"
  },
  CA: {
    dmv: "https://www.dmv.ca.gov",
    tax: "https://www.cdtfa.ca.gov",
    forms: "https://www.dmv.ca.gov/portal/vehicle-industry-services/"
  },
  FL: {
    dmv: "https://www.flhsmv.gov",
    tax: "https://floridarevenue.com",
    forms: "https://www.flhsmv.gov/motor-vehicles-tags-titles/"
  },
  AZ: {
    dmv: "https://azdot.gov/mvd",
    tax: "https://azdor.gov",
    forms: "https://azdot.gov/motor-vehicles/vehicle-services"
  },
  CO: {
    dmv: "https://dmv.colorado.gov",
    tax: "https://tax.colorado.gov",
    forms: "https://dmv.colorado.gov/dealer-services"
  },
  NV: {
    dmv: "https://dmv.nv.gov",
    tax: "https://tax.nv.gov",
    forms: "https://dmv.nv.gov/dealer.htm"
  },
  ID: {
    dmv: "https://itd.idaho.gov/dmv",
    tax: "https://tax.idaho.gov",
    forms: "https://itd.idaho.gov/dmv/vehicles/"
  },
};

// Validate URL and return status code
async function checkUrl(url: string): Promise<{ url: string; valid: boolean; status: number | string }> {
  if (!url) return { url, valid: false, status: "no_url" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
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
    const resources = stateResources[stateUpper] || {
      dmv: `https://dmv.${state.toLowerCase()}.gov`,
      tax: `https://tax.${state.toLowerCase()}.gov`,
      forms: `https://dmv.${state.toLowerCase()}.gov/forms`
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

    // AI prompt - request MULTIPLE URLs per form
    const systemPrompt = `You are a compliance expert for ${stateUpper} used car dealers.

List ALL forms a dealer needs. For EACH form, provide MULTIPLE possible download URLs if you know them.

DEAL TYPES:
- all_deals: Forms needed for every sale
- cash: Cash purchase only
- financed: BHPH/dealer financing
- trade_in: Customer trading in vehicle
- wholesale: Dealer-to-dealer

For source_urls, include ALL possible locations where this form might be found:
- State DMV website
- State Tax Commission
- Department of Revenue
- Secretary of State
- Federal sites (ftc.gov, nhtsa.gov)

Return ONLY valid JSON array. No markdown.`;

    const userPrompt = `List ALL forms for ${stateUpper} used car dealers.

Return JSON array with MULTIPLE URLs per form:
[
  {
    "form_name": "Utah Bill of Sale",
    "form_number": "TC-891",
    "category": "deal",
    "deal_types": ["all_deals"],
    "description": "Required for all vehicle sales",
    "source_urls": [
      "https://dmv.utah.gov/forms/tc-891.pdf",
      "https://tax.utah.gov/forms/current/tc-891.pdf",
      "https://dmv.utah.gov/vehicles/dealers/forms"
    ],
    "where_to_find": "Utah DMV or Tax Commission website"
  }
]

IMPORTANT:
- source_urls is an ARRAY - include ALL possible URLs where the form might be found
- Include .gov URLs from DMV, Tax Commission, DOT, etc.
- It's OK if some URLs don't work - we'll validate them
- Set source_urls to empty array [] if you don't know any URLs

FORMS TO INCLUDE (25-30 minimum):

ALL DEALS:
- Bill of Sale, Odometer Disclosure (federal), FTC Buyers Guide
- Title Application, Dealer Report of Sale, Delivery Receipt

FINANCED/BHPH:
- Retail Installment Contract, Truth in Lending, Security Agreement
- Payment Schedule, Credit Application, Privacy Notice, GAP Waiver

TRADE-IN:
- Trade-In Appraisal, Lien Payoff Auth, Power of Attorney

TAX:
- Sales Tax Return, Exemption Certificate

COMPLIANCE:
- Dealer License, Surety Bond, Salesperson License

DISCLOSURES:
- Salvage/Rebuilt, Damage, Frame Damage, Emissions/Safety

Return the JSON array now.`;

    console.log(`[${stateUpper}] Calling AI for forms with multiple URLs...`);

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
      console.error(`[${stateUpper}] Parse error:`, content.substring(0, 300));
      throw new Error("Failed to parse AI response");
    }

    const aiReturnedCount = forms.length;
    console.log(`[${stateUpper}] AI returned ${aiReturnedCount} forms`);

    // Collect ALL URLs from all forms for parallel validation
    const allUrls: { formIndex: number; url: string }[] = [];
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      // Handle both source_urls (array) and source_url (string) for backwards compatibility
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

    console.log(`[${stateUpper}] Validating ${allUrls.length} URLs in parallel...`);

    // Validate all URLs in parallel
    const urlResults = await Promise.all(
      allUrls.map(({ url }) => checkUrl(url))
    );

    // Group results by form index
    const urlsByForm: Map<number, Array<{ url: string; valid: boolean; status: number | string }>> = new Map();
    for (let i = 0; i < allUrls.length; i++) {
      const { formIndex } = allUrls[i];
      if (!urlsByForm.has(formIndex)) {
        urlsByForm.set(formIndex, []);
      }
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

      // Get URL validation results for this form
      const formUrls = urlsByForm.get(i) || [];
      totalUrlsValidated += formUrls.length;

      // Find first working URL (if any)
      const workingUrl = formUrls.find(u => u.valid);
      const hasWorkingUrl = !!workingUrl;
      if (hasWorkingUrl) totalUrlsWorking++;

      // Build alternate_urls array with all URLs and their status
      const alternateUrls = formUrls.map(u => ({
        url: u.url,
        status: u.status,
        valid: u.valid
      }));

      // Normalize category
      let category = form.category?.toLowerCase() || "deal";
      const validCategories = ["deal", "title", "financing", "tax", "compliance", "disclosure"];
      if (!validCategories.includes(category)) category = "deal";

      // Normalize deal_types
      let dealTypes = form.deal_types;
      if (!Array.isArray(dealTypes)) {
        dealTypes = ["all_deals"];
      }

      toInsert.push({
        form_number: formNum,
        form_name: form.form_name.trim(),
        state: stateUpper,
        // source_url = first working URL, or first URL if none work, or null
        source_url: workingUrl?.url || formUrls[0]?.url || null,
        category,
        description: form.description || null,
        workflow_status: "staging",
        // pdf_validated = true if ANY URL works
        pdf_validated: hasWorkingUrl,
        ai_discovered: true,
        required_for: dealTypes,
        // Store ALL URLs with their validation status
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
      const { data, error } = await supabase
        .from("form_staging")
        .insert(toInsert)
        .select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // Fallback: remove columns that might not exist
        if (error.message.includes("column")) {
          console.log(`[${stateUpper}] Retrying without optional columns...`);

          const fallbackInsert = toInsert.map(({ required_for, alternate_urls, ...rest }) => rest);

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

    // Organize forms by deal type
    const byDealType: Record<string, any[]> = {
      all_deals: [], cash: [], financed: [], trade_in: [], wholesale: [], consignment: []
    };

    for (const form of toInsert) {
      const dealTypes = form.required_for || ["all_deals"];
      for (const dt of dealTypes) {
        if (byDealType[dt]) {
          byDealType[dt].push({
            form_name: form.form_name,
            form_number: form.form_number,
          });
        }
      }
    }

    // Build response with full URL info
    const formsList = toInsert.map(f => ({
      form_name: f.form_name,
      form_number: f.form_number,
      category: f.category,
      deal_types: f.required_for,
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

        // State resources
        state_resources: resources,

        // Forms by deal type
        forms_by_deal_type: {
          all_deals: byDealType.all_deals.length,
          cash_sale: byDealType.cash.length,
          financed_bhph: byDealType.financed.length,
          trade_in: byDealType.trade_in.length,
          wholesale: byDealType.wholesale.length,
          consignment: byDealType.consignment.length,
        },

        // Full form list with all URLs
        forms: formsList,

        ...(insertError ? { insert_error: insertError } : {}),

        message: `Found ${aiReturnedCount} forms. ${insertedCount} added. Checked ${totalUrlsValidated} URLs (${totalUrlsWorking} working).`
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
