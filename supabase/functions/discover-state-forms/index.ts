import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// State DMV base URLs for fallback
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This function uses service role key for DB operations
    // Authorization is handled by Supabase's built-in JWT verification
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

    // AI prompt with doc_type, deadline tracking, and compliance notes
    const systemPrompt = `You are an expert on US state DMV forms and dealer compliance requirements.

Your task: Return a JSON array of official DMV/state forms required for auto dealers in the given state.

CRITICAL REQUIREMENTS:
1. Every form MUST have a source_url - use official state DMV/DOT/DOR website URLs
2. If you don't know the exact URL, use the state's main forms page: ${fallbackUrl}
3. Form numbers must be accurate and real
4. Categorize each form by doc_type and identify deadlines
5. Include detailed compliance_notes explaining the form's purpose and requirements

Response format - return ONLY valid JSON, no markdown:
[
  {
    "form_number": "TC-69",
    "form_name": "Application for Utah Title",
    "doc_type": "deal",
    "source_url": "https://dmv.utah.gov/forms/tc-69.pdf",
    "has_deadline": true,
    "deadline_days": 30,
    "deadline_description": "Within 30 days of sale",
    "cadence": "per_transaction",
    "compliance_notes": "Required for every vehicle sale. Dealer must submit within 30 days or face $25 late fee. Used for: all cash sales, financed sales, trade-ins. Requires odometer disclosure, VIN verification, and lienholder info if financed."
  },
  {
    "form_number": "TC-62M",
    "form_name": "Monthly Sales Tax Return",
    "doc_type": "tax",
    "source_url": "https://tax.utah.gov/forms/tc-62m.pdf",
    "has_deadline": true,
    "deadline_days": 25,
    "deadline_description": "Due by 25th of following month",
    "cadence": "monthly",
    "compliance_notes": "Monthly sales tax filing. Report all vehicle sales from previous month. Include sales tax collected on each transaction. Penalty: 10% of tax due + interest if late. Required even if no sales (file zero return)."
  }
]

doc_type values:
- deal: Forms needed per vehicle sale (title, registration, bill of sale, odometer)
- finance: BHPH/financing disclosures, loan agreements, truth in lending
- licensing: Dealer license renewal, surety bonds, business permits
- tax: Sales tax returns, use tax filings
- reporting: DMV reports, inventory reports, dealer reports

cadence values:
- per_transaction: Required for each vehicle sale
- monthly: Monthly filing requirement
- quarterly: Quarterly filing requirement
- annually: Annual renewal/filing

compliance_notes should include:
- What the form is used for
- When it's required (cash sale, BHPH, financed, trade-in, all sales)
- Penalties for non-compliance
- Any special requirements or conditions

Only include forms you're confident exist. Every form MUST have source_url.`;

    const userPrompt = `List ALL required forms for auto dealers in ${stateUpper}${county ? `, ${county} County` : ""}.

For EACH form, provide detailed compliance_notes explaining:
- Purpose and when to use (cash sale, BHPH, financed, all sales)
- Compliance deadline and penalties
- Any special requirements

Categories to include:
1. DEAL DOCS (per sale): Title transfer, registration, bill of sale, odometer disclosure, buyer's guide
2. FINANCE DOCS: BHPH/in-house financing disclosures, retail installment contracts, truth in lending
3. LICENSING DOCS: Dealer license renewal, surety bond, business license
4. TAX DOCS: Sales tax returns (monthly/quarterly), use tax filings
5. REPORTING DOCS: DMV reports, inventory reports

Remember: Every form MUST have source_url and detailed compliance_notes.`;

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
        max_tokens: 4000,
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
      console.log("Raw AI response:", content);

      // Clean up the response - multiple strategies
      let cleaned = content;

      // Remove markdown code blocks
      cleaned = cleaned.replace(/```json\s*/gi, "");
      cleaned = cleaned.replace(/```\s*/g, "");

      // Try to find JSON array in the response
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        cleaned = arrayMatch[0];
      }

      cleaned = cleaned.trim();
      console.log("Cleaned response:", cleaned);

      forms = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      console.error("Parse error:", parseError.message);

      // Return empty array instead of throwing - let function complete gracefully
      forms = [];
      console.log("Returning empty forms array due to parse error");
    }

    if (!Array.isArray(forms)) {
      forms = [];
    }

    console.log(`AI returned ${forms.length} forms`);

    // Process and validate forms
    const validForms: any[] = [];
    const skippedForms: string[] = [];

    for (const form of forms) {
      // Skip if already exists
      if (existingFormNumbers.has(form.form_number)) {
        console.log(`Skipping duplicate: ${form.form_number}`);
        continue;
      }

      // Validate required fields
      if (!form.form_number || !form.form_name) {
        console.log(`Skipping invalid form (missing number/name):`, form);
        skippedForms.push(form.form_number || "unknown");
        continue;
      }

      // FIX: Handle missing source_url with fallback
      let sourceUrl = form.source_url;
      if (!sourceUrl || sourceUrl.trim() === "") {
        // Generate a fallback URL based on form number
        const formSlug = form.form_number.toLowerCase().replace(/[^a-z0-9]/g, "-");
        sourceUrl = `${fallbackUrl}/${formSlug}`;
        console.log(`Generated fallback URL for ${form.form_number}: ${sourceUrl}`);
      }

      // Validate URL format
      try {
        new URL(sourceUrl);
      } catch {
        // If URL is invalid, use fallback
        sourceUrl = fallbackUrl;
        console.log(`Invalid URL for ${form.form_number}, using fallback: ${sourceUrl}`);
      }

      // Include doc_type and deadline tracking
      validForms.push({
        form_number: form.form_number.toUpperCase().trim(),
        form_name: form.form_name.trim(),
        state: stateUpper,
        source_url: sourceUrl,
        status: "pending",
        ai_confidence: 0.70,
        doc_type: form.doc_type || "deal",
        has_deadline: form.has_deadline === true,
        deadline_days: form.deadline_days ? parseInt(form.deadline_days) : null,
        deadline_description: form.deadline_description || null,
        cadence: form.cadence || (form.has_deadline ? "per_transaction" : null),
        compliance_notes: form.compliance_notes || null,
      });
    }

    console.log(`Valid forms to insert: ${validForms.length}, Skipped: ${skippedForms.length}`);

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

    // === PHASE 2: Discover Compliance Rules ===
    let rulesInserted = 0;
    try {
      console.log(`Discovering compliance rules for ${stateUpper}...`);

      // Check existing rules to avoid duplicates
      const { data: existingRules } = await supabase
        .from("compliance_rules")
        .select("rule_name")
        .eq("state", stateUpper);

      const existingRuleNames = new Set(existingRules?.map((r) => r.rule_name.toLowerCase()) || []);

    const rulesSystemPrompt = `You are an expert on US state auto dealer compliance requirements for independent auto dealers.

Your task: Return a JSON array of ALL compliance rules and filing requirements for auto dealers in the given state.

Response format - return ONLY valid JSON, no markdown:
[
  {
    "rule_name": "Monthly Sales Tax Return",
    "category": "tax",
    "agency": "Utah State Tax Commission",
    "description": "Report and remit sales tax collected on vehicle sales",
    "deadline_days": 25,
    "deadline_description": "Due by 25th of following month",
    "filing_cadence": "monthly",
    "late_fee": 25.00,
    "penalty_description": "5% penalty plus 1% per month interest",
    "required_forms": ["TC-62M", "TC-941"]
  }
]

Categories to cover:
- tax: Sales tax filing, use tax, inventory tax
- title: Title transfer deadlines per sale
- registration: Vehicle registration requirements
- licensing: Dealer license renewal, bond requirements, surety
- disclosure: Required buyer disclosures (AS-IS, damage, odometer)
- financing: BHPH/financing disclosure requirements, usury limits
- reporting: DMV/state reporting requirements

Filing cadence options: monthly, quarterly, annually, per_transaction

IMPORTANT: Include rules for ALL deal types:
1. CASH SALES - what's required per cash sale
2. BHPH (Buy Here Pay Here) - in-house financing requirements, disclosures, usury laws
3. BANK/OUTSIDE FINANCING - third party financing requirements
4. TRADE-INS - title/lien payoff requirements

Be specific about deadlines. Example: "Title must be transferred within 30 days of sale"

Only include rules you're confident about for this specific state.`;

    const rulesUserPrompt = `List ALL compliance rules for auto dealers in ${stateUpper}, covering:

1. TAX RULES:
   - Sales tax filing frequency and deadlines
   - Use tax requirements
   - Late penalties

2. TITLE/REGISTRATION (per sale):
   - Days to transfer title after sale
   - Registration requirements
   - Temporary tag limits and duration

3. DEALER LICENSING:
   - License renewal deadlines
   - Bond requirements
   - Continuing education

4. DEAL-TYPE SPECIFIC:
   - BHPH/In-house financing rules (interest rate caps, disclosure requirements)
   - Cash sale requirements
   - Outside financing requirements

5. REQUIRED DISCLOSURES:
   - Buyer's Guide requirements
   - AS-IS disclosure
   - Damage/accident disclosure
   - Odometer disclosure timing

For each rule provide: deadline_days, filing_cadence, late_fee, required_forms, agency
- The responsible agency`;

    const rulesResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 4000,
        system: rulesSystemPrompt,
        messages: [{ role: "user", content: rulesUserPrompt }],
      }),
    });

    console.log(`Rules API response status: ${rulesResponse.status}`);

    let rules: any[] = [];
    if (rulesResponse.ok) {
      const rulesResult = await rulesResponse.json();
      const rulesContent = rulesResult.content?.[0]?.text || "[]";
      console.log(`Rules AI response length: ${rulesContent.length} chars`);

      try {
        let cleanedRules = rulesContent;
        cleanedRules = cleanedRules.replace(/```json\s*/gi, "");
        cleanedRules = cleanedRules.replace(/```\s*/g, "");
        const arrayMatch = cleanedRules.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          cleanedRules = arrayMatch[0];
        }
        rules = JSON.parse(cleanedRules.trim());
        console.log(`Parsed ${rules.length} rules from AI`);
      } catch (parseError) {
        console.error("Failed to parse rules response:", rulesContent.substring(0, 500));
        rules = [];
      }
    } else {
      const errorText = await rulesResponse.text();
      console.error(`Rules API failed: ${rulesResponse.status} - ${errorText.substring(0, 200)}`);
    }

    if (Array.isArray(rules) && rules.length > 0) {
        const validRules: any[] = [];

        for (const rule of rules) {
          if (!rule.rule_name || existingRuleNames.has(rule.rule_name.toLowerCase())) {
            continue;
          }

          // Only use columns that definitely exist in compliance_rules table
          const ruleDescription = [
            rule.description || "",
            "",
            `Filing: ${rule.filing_cadence || "per transaction"}`,
            `Deadline: ${rule.deadline_description || (rule.deadline_days + " days after sale/period")}`,
            rule.penalty_description ? `Penalty: ${rule.penalty_description}` : "",
            rule.required_forms?.length ? `Forms: ${rule.required_forms.join(", ")}` : "",
          ].filter(Boolean).join("\n");

          validRules.push({
            rule_name: rule.rule_name,
            state: stateUpper,
            category: rule.category || "tax",
            agency: rule.agency || `${stateUpper} DMV`,
            description: ruleDescription,
            deadline_days: parseInt(rule.deadline_days) || 30,
            late_fee: parseFloat(rule.late_fee) || 0,
          });

          console.log(`Prepared rule: ${rule.rule_name}`);
        }

      console.log(`Valid rules to insert: ${validRules.length}`);

      if (validRules.length > 0) {
        const { data: insertedRules, error: rulesError } = await supabase
          .from("compliance_rules")
          .insert(validRules)
          .select();

        if (!rulesError) {
          rulesInserted = insertedRules?.length || 0;
          console.log(`Successfully inserted ${rulesInserted} compliance rules`);
        } else {
          console.error("Rules insert error:", JSON.stringify(rulesError));
        }
      }
    }
    } catch (rulesErr: any) {
      console.error("Rules discovery failed (non-fatal):", rulesErr.message);
      // Continue without rules - forms still work
    }

    return new Response(
      JSON.stringify({
        success: true,
        state: stateUpper,
        forms_found: forms.length,
        forms_added: insertedCount,
        forms_skipped: skippedForms.length,
        valid_forms: validForms.length,
        rules_added: rulesInserted,
        skipped_reasons: skippedForms.length > 0 ? skippedForms : undefined,
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
