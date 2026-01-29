import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State resource links - where dealers can find forms
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

    console.log(`[${stateUpper}] Discovering forms by deal type...`);

    // AI prompt focused on DEAL TYPES
    const systemPrompt = `You are a compliance expert for ${stateUpper} used car dealers.

Your job: List ALL forms/documents a dealer needs, organized by WHEN they're used.

DEAL TYPES TO COVER:
1. CASH SALE - Customer pays full amount, no financing
2. FINANCED SALE (BHPH) - Dealer provides in-house financing
3. TRADE-IN - Customer trades in a vehicle as part of deal
4. WHOLESALE - Dealer-to-dealer sale
5. CONSIGNMENT - Selling vehicle on behalf of owner

FOR EACH FORM, specify which deal types require it using this array:
deal_types: ["cash", "financed", "trade_in", "wholesale", "consignment", "all_deals"]

Use "all_deals" for forms needed on EVERY transaction (like bill of sale, odometer).

IMPORTANT:
- Include ALL federal requirements (FTC Buyers Guide, Odometer Disclosure, TILA for financing)
- Include ${stateUpper}-specific forms with actual form numbers if known
- Set source_url to null if unsure - don't guess URLs
- Focus on being COMPLETE, not on having working URLs

Return ONLY valid JSON array. No markdown.`;

    const userPrompt = `List ALL forms for a ${stateUpper} used car dealer. Return JSON array:

[
  {
    "form_name": "Bill of Sale",
    "form_number": "TC-891" or null,
    "category": "deal" | "title" | "financing" | "tax" | "compliance" | "disclosure",
    "deal_types": ["cash", "financed", "trade_in", "wholesale", "consignment", "all_deals"],
    "description": "Required for all vehicle sales to document transfer",
    "source_url": "https://..." or null,
    "where_to_find": "Utah DMV website or Tax Commission"
  }
]

MUST INCLUDE (at minimum):

EVERY DEAL needs:
- Bill of Sale (state form if exists)
- Odometer Disclosure Statement (federal)
- FTC Buyers Guide / As-Is disclosure
- Title Application
- Dealer Report of Sale
- Vehicle Delivery Receipt

FINANCED/BHPH deals also need:
- Retail Installment Contract
- Truth in Lending Disclosure (federal Reg Z)
- Security Agreement
- Payment Schedule
- Credit Application
- Privacy Notice (GLBA)
- GAP Waiver (if offered)

TRADE-IN deals also need:
- Trade-In Appraisal form
- Title from customer
- Lien payoff authorization (if applicable)
- Power of Attorney

TAX & COMPLIANCE:
- Monthly Sales Tax Return
- Tax Exemption Certificate (for exempt buyers)
- Dealer License Renewal
- Surety Bond

DISCLOSURES:
- Salvage/Rebuilt Title Disclosure
- Damage Disclosure
- Frame Damage Disclosure
- Emissions/Safety Inspection (if required in ${stateUpper})

Include at least 25-30 forms total. For "where_to_find" suggest where dealer can get the form.`;

    console.log(`[${stateUpper}] Calling AI...`);

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

    // Build insert list - ALL forms get added
    const toInsert: any[] = [];
    const duplicates: string[] = [];

    for (const form of forms) {
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

      // Normalize category
      let category = form.category?.toLowerCase() || "deal";
      const validCategories = ["deal", "title", "financing", "tax", "compliance", "disclosure"];
      if (!validCategories.includes(category)) category = "deal";

      // Normalize deal_types
      let dealTypes = form.deal_types;
      if (!Array.isArray(dealTypes)) {
        dealTypes = ["all_deals"];
      }

      // Build where_to_find with state resources
      let whereToFind = form.where_to_find || null;
      if (!whereToFind) {
        if (category === "tax") {
          whereToFind = resources.tax;
        } else if (category === "title" || category === "deal") {
          whereToFind = resources.dmv;
        } else {
          whereToFind = resources.forms;
        }
      }

      toInsert.push({
        form_number: formNum,
        form_name: form.form_name.trim(),
        state: stateUpper,
        source_url: form.source_url || null,
        category,
        description: form.description || null,
        // All forms start as needs_upload since we're not validating URLs
        workflow_status: "staging",
        pdf_validated: false,
        ai_discovered: true,
        // Store deal_types and where_to_find in description if no dedicated columns
        required_for: dealTypes,
        ...(dealer_id ? { dealer_id } : {}),
      });
    }

    console.log(`[${stateUpper}] Inserting ${toInsert.length} forms...`);

    // Insert all forms
    let insertedCount = 0;
    let insertError: string | null = null;

    if (toInsert.length > 0) {
      // Try insert with required_for field
      const { data, error } = await supabase
        .from("form_staging")
        .insert(toInsert)
        .select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // Fallback without required_for if column doesn't exist
        if (error.message.includes("column") || error.message.includes("required_for")) {
          console.log(`[${stateUpper}] Retrying without required_for...`);

          const fallbackInsert = toInsert.map(({ required_for, ...rest }) => rest);

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

    console.log(`[${stateUpper}] Inserted: ${insertedCount}, Duplicates: ${duplicates.length}`);

    // Organize forms by deal type for response
    const byDealType: Record<string, any[]> = {
      all_deals: [],
      cash: [],
      financed: [],
      trade_in: [],
      wholesale: [],
      consignment: []
    };

    for (const form of toInsert) {
      const dealTypes = form.required_for || ["all_deals"];
      for (const dt of dealTypes) {
        if (byDealType[dt]) {
          byDealType[dt].push({
            form_name: form.form_name,
            form_number: form.form_number,
            category: form.category,
            description: form.description,
          });
        }
      }
    }

    // Build response
    const formsList = toInsert.map(f => ({
      form_name: f.form_name,
      form_number: f.form_number,
      category: f.category,
      deal_types: f.required_for,
      description: f.description,
      source_url: f.source_url,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,

        // Summary
        ai_returned: aiReturnedCount,
        total_inserted: insertedCount,
        duplicates_skipped: duplicates.length,

        // State resources - where to find forms
        state_resources: resources,

        // Forms organized by deal type
        forms_by_deal_type: {
          all_deals: byDealType.all_deals.length,
          cash_sale: byDealType.cash.length,
          financed_bhph: byDealType.financed.length,
          trade_in: byDealType.trade_in.length,
          wholesale: byDealType.wholesale.length,
          consignment: byDealType.consignment.length,
        },

        // Full form list
        forms: formsList,

        // Error if any
        ...(insertError ? { insert_error: insertError } : {}),

        message: `Found ${aiReturnedCount} forms for ${stateUpper}. ${insertedCount} added to database.`
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
