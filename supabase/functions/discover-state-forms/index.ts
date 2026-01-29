import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Quick URL validation (3s timeout)
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

    // Get existing forms to avoid duplicates
    const { data: existing } = await supabase
      .from("form_staging")
      .select("form_number, form_name")
      .eq("state", stateUpper);

    const existingKeys = new Set([
      ...(existing?.map(f => f.form_number?.toUpperCase()).filter(Boolean) || []),
      ...(existing?.map(f => f.form_name?.toLowerCase()).filter(Boolean) || [])
    ]);

    console.log(`[${stateUpper}] Starting comprehensive form discovery...`);
    console.log(`[${stateUpper}] Existing forms in DB: ${existingKeys.size}`);

    // Comprehensive AI prompt
    const systemPrompt = `You are a compliance expert for used car dealerships. List EVERY form, document, and report a USED CAR DEALER in ${stateUpper} needs. Be EXHAUSTIVE.

MUST INCLUDE ALL OF THESE CATEGORIES:

1. DEAL DOCUMENTS (for every sale):
- Bill of Sale
- Buyers Order / Purchase Agreement
- Odometer Disclosure Statement (federal)
- FTC Buyers Guide / As-Is Warranty
- Vehicle Condition Report
- Delivery Checklist

2. TITLE & REGISTRATION:
- Title Application
- Dealer Report of Sale
- Power of Attorney for Title
- Lien Release forms
- Duplicate Title Request
- VIN Inspection form
- Temporary Permit / Temp Tags

3. FINANCING / BHPH:
- Retail Installment Contract (Motor Vehicle Contract of Sale)
- Security Agreement
- Truth in Lending Disclosure
- Payment Schedule / Amortization
- GAP Waiver Agreement
- Arbitration Agreement
- Credit Application
- Privacy Notice

4. TAX FORMS:
- Sales Tax Return (monthly)
- Sales Tax Exemption Certificate
- Trade-In Credit forms

5. COMPLIANCE & LICENSING:
- Dealer License Application/Renewal
- Surety Bond
- Business License
- Consignment Agreement
- Wholesale Agreement
- Auction forms

6. DISCLOSURES:
- Damage Disclosure
- Salvage/Rebuilt Title Disclosure
- Flood Damage Disclosure
- Frame Damage Disclosure
- Emissions/Smog forms
- Safety Inspection

Return ONLY a valid JSON array. No markdown code blocks. No explanatory text.`;

    const userPrompt = `For ${stateUpper}, provide ALL required dealer forms:

Return JSON array with this EXACT structure:
[
  {
    "form_name": "Official name of the form",
    "form_number": "TC-69" or null if no number,
    "category": "deal" | "title" | "financing" | "tax" | "compliance" | "disclosure",
    "description": "What this form is used for",
    "source_url": "https://exact.gov.url/form.pdf" or null if unknown,
    "required": true or false
  }
]

REQUIREMENTS:
- Include AT LEAST 25 forms
- Include both ${stateUpper}-specific AND federal requirements
- For source_url, only use URLs you're confident exist (state .gov sites)
- Set source_url to null if you don't know the exact PDF link
- Include ALL categories listed above

Common ${stateUpper} form sources:
- DMV forms: dmv.${state.toLowerCase()}.gov or similar
- Tax forms: tax.${state.toLowerCase()}.gov
- Federal: ftc.gov, nhtsa.gov

Return the JSON array now.`;

    console.log(`[${stateUpper}] Calling Claude API for comprehensive form list...`);

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
      const errText = await aiResponse.text();
      console.error(`[${stateUpper}] AI API error:`, errText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text || "[]";

    // Parse JSON response
    let forms: any[] = [];
    try {
      let cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (match) cleaned = match[0];
      forms = JSON.parse(cleaned);
    } catch (e) {
      console.error(`[${stateUpper}] JSON parse failed. Raw response:`, content.substring(0, 500));
      throw new Error("Failed to parse AI response as JSON");
    }

    if (!Array.isArray(forms)) {
      throw new Error("AI response is not an array");
    }

    const aiReturnedCount = forms.length;
    console.log(`[${stateUpper}] AI returned ${aiReturnedCount} forms`);

    if (aiReturnedCount === 0) {
      throw new Error("AI returned zero forms");
    }

    // Validate all URLs in parallel
    console.log(`[${stateUpper}] Validating URLs in parallel...`);
    const validated = await Promise.all(
      forms.map(async (form) => ({
        form,
        urlValid: form.source_url ? await checkUrl(form.source_url) : false
      }))
    );

    // Build insert list - INSERT ALL FORMS (no skipping except duplicates)
    const toInsert: any[] = [];
    const duplicates: string[] = [];
    let readyCount = 0;
    let needsUploadCount = 0;

    for (const { form, urlValid } of validated) {
      // Skip if no form name
      if (!form.form_name || typeof form.form_name !== 'string') {
        console.log(`[${stateUpper}] Skipping form with no name`);
        continue;
      }

      const formNum = form.form_number?.toString().toUpperCase().trim() || null;
      const formName = form.form_name.toLowerCase().trim();

      // Check for duplicates (already in DB or in this batch)
      if ((formNum && existingKeys.has(formNum)) || existingKeys.has(formName)) {
        duplicates.push(formNum || form.form_name);
        continue;
      }

      // Add to set to prevent duplicates within batch
      if (formNum) existingKeys.add(formNum);
      existingKeys.add(formName);

      // Set workflow status based on URL validity
      // URL works → staging (ready for HTML generation)
      // URL broken/missing → needs_upload (user must upload PDF)
      const workflowStatus = urlValid ? "staging" : "needs_upload";

      if (urlValid) {
        readyCount++;
      } else {
        needsUploadCount++;
      }

      // Normalize category
      let category = form.category?.toLowerCase() || "deal";
      const validCategories = ["deal", "title", "financing", "tax", "compliance", "disclosure"];
      if (!validCategories.includes(category)) {
        category = "deal";
      }

      toInsert.push({
        form_number: formNum,
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

    console.log(`[${stateUpper}] Forms to insert: ${toInsert.length}`);
    console.log(`[${stateUpper}] - Ready (PDF valid): ${readyCount}`);
    console.log(`[${stateUpper}] - Needs upload: ${needsUploadCount}`);
    console.log(`[${stateUpper}] - Duplicates skipped: ${duplicates.length}`);

    // Verify: AI returned should equal (inserted + duplicates)
    const accountedFor = toInsert.length + duplicates.length;
    if (accountedFor !== aiReturnedCount) {
      console.warn(`[${stateUpper}] WARNING: AI returned ${aiReturnedCount} but only ${accountedFor} accounted for`);
    }

    // Insert ALL forms
    let insertedCount = 0;
    let insertError: string | null = null;

    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from("form_staging")
        .insert(toInsert)
        .select("id");

      if (error) {
        console.error(`[${stateUpper}] Insert error:`, error.message);

        // Fallback: if 'needs_upload' status rejected, retry with 'staging'
        if (error.message.includes("violates") || error.message.includes("constraint")) {
          console.log(`[${stateUpper}] Constraint error - retrying with 'staging' status...`);

          const fallbackInsert = toInsert.map(f => ({
            ...f,
            workflow_status: "staging"
          }));

          const { data: retryData, error: retryError } = await supabase
            .from("form_staging")
            .insert(fallbackInsert)
            .select("id");

          if (retryError) {
            insertError = retryError.message;
            console.error(`[${stateUpper}] Retry also failed:`, retryError.message);
          } else {
            insertedCount = retryData?.length || 0;
            console.log(`[${stateUpper}] Retry succeeded: ${insertedCount} inserted`);
          }
        } else {
          insertError = error.message;
        }
      } else {
        insertedCount = data?.length || 0;
      }
    }

    // Final logging
    console.log(`[${stateUpper}] === SUMMARY ===`);
    console.log(`[${stateUpper}] AI returned: ${aiReturnedCount}`);
    console.log(`[${stateUpper}] Inserted: ${insertedCount}`);
    console.log(`[${stateUpper}] Duplicates: ${duplicates.length}`);
    console.log(`[${stateUpper}] Ready for processing: ${readyCount}`);
    console.log(`[${stateUpper}] Need PDF upload: ${needsUploadCount}`);

    // Build response
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

        // Counts
        ai_returned: aiReturnedCount,
        total_inserted: insertedCount,
        ready_for_processing: readyCount,
        needs_upload: needsUploadCount,
        duplicates_skipped: duplicates.length,

        // Full form list
        forms: formsList,

        // Error if any
        ...(insertError ? { insert_error: insertError } : {}),

        message: `AI found ${aiReturnedCount} forms. Inserted ${insertedCount} (${readyCount} ready, ${needsUploadCount} need PDF upload). ${duplicates.length} duplicates skipped.`
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
