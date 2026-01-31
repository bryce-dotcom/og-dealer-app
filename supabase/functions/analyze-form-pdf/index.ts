import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// UNIVERSAL FIELDS - for AI context
// These are the standard fields we map to
// ============================================

const universalFieldCategories = {
  buyer: [
    "buyer_name", "buyer_first_name", "buyer_last_name", "buyer_address", "buyer_address2",
    "buyer_city", "buyer_state", "buyer_zip", "buyer_county", "buyer_phone", "buyer_phone_alt",
    "buyer_email", "buyer_dl_number", "buyer_dl_state", "buyer_dl_exp", "buyer_dob",
    "buyer_ssn", "buyer_ssn_last4", "buyer_employer", "buyer_employer_phone", "buyer_income",
    "buyer_signature", "buyer_signature_date"
  ],
  co_buyer: [
    "co_buyer_name", "co_buyer_first_name", "co_buyer_last_name", "co_buyer_address",
    "co_buyer_city", "co_buyer_state", "co_buyer_zip", "co_buyer_phone",
    "co_buyer_dl_number", "co_buyer_dl_state", "co_buyer_dob", "co_buyer_ssn",
    "co_buyer_signature", "co_buyer_signature_date"
  ],
  dealer: [
    "dealer_name", "dealer_dba", "dealer_address", "dealer_city", "dealer_state",
    "dealer_zip", "dealer_county", "dealer_phone", "dealer_fax", "dealer_email",
    "dealer_license", "dealer_ein", "dealer_sales_tax_id",
    "dealer_signature", "dealer_signature_date", "salesperson_name", "salesperson_number"
  ],
  vehicle: [
    "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_trim", "vehicle_body",
    "vehicle_vin", "vehicle_stock", "vehicle_miles", "vehicle_miles_exempt",
    "vehicle_miles_exceeds", "vehicle_miles_not_actual", "vehicle_color",
    "vehicle_interior_color", "vehicle_engine", "vehicle_cylinders", "vehicle_transmission",
    "vehicle_drive", "vehicle_fuel", "vehicle_title_number", "vehicle_title_state",
    "vehicle_plate", "vehicle_weight", "vehicle_new_used", "vehicle_warranty"
  ],
  deal: [
    "sale_date", "delivery_date", "deal_number", "sale_price", "msrp",
    "trade_allowance", "trade_payoff", "net_trade", "down_payment", "rebate",
    "doc_fee", "title_fee", "registration_fee", "smog_fee", "other_fees",
    "other_fees_desc", "total_fees", "subtotal", "tax_rate", "tax_amount",
    "total_price", "amount_financed", "balance_due"
  ],
  financing: [
    "apr", "term_months", "monthly_payment", "payment_frequency", "num_payments",
    "first_payment_date", "final_payment_date", "final_payment_amount",
    "total_of_payments", "finance_charge", "total_sale_price", "deferred_price",
    "late_fee", "late_days", "prepayment_penalty"
  ],
  trade: [
    "trade_year", "trade_make", "trade_model", "trade_vin", "trade_miles",
    "trade_color", "trade_title_number", "trade_plate", "trade_lienholder",
    "trade_lienholder_address", "trade_payoff_good_thru"
  ],
  lien: [
    "lienholder_name", "lienholder_address", "lienholder_city",
    "lienholder_state", "lienholder_zip", "lienholder_elt"
  ],
  insurance: [
    "insurance_company", "insurance_policy", "insurance_agent",
    "insurance_phone", "insurance_exp"
  ]
};

// Flatten for AI context
const allUniversalFields = Object.entries(universalFieldCategories)
  .map(([category, fields]) => fields.map(f => `${f} (${category})`))
  .flat();

// ============================================
// PDF ANALYSIS PROMPT
// ============================================

const buildAnalysisPrompt = (formName: string, formNumber: string | null, state: string) => `
You are analyzing a PDF form used by auto dealers. Your task is to identify all fillable fields in this PDF and map them to our universal field system.

FORM BEING ANALYZED:
- Form Name: ${formName}
- Form Number: ${formNumber || "Unknown"}
- State: ${state}

UNIVERSAL FIELDS AVAILABLE (use these exact field keys):
${allUniversalFields.join("\n")}

INSTRUCTIONS:
1. Examine the PDF carefully
2. Identify EVERY fillable field, text box, checkbox, date field, and signature line
3. For each field found, determine which universal_field it maps to
4. Assign a confidence score (0.0 to 1.0) based on how certain you are of the mapping
5. If a PDF field doesn't match any universal field, mark it as "unmapped"

RESPOND WITH VALID JSON ONLY:
{
  "form_analysis": {
    "total_pages": <number>,
    "form_type": "<deal|title|financing|disclosure|tax|compliance>",
    "deal_types": ["<cash|bhph|traditional|wholesale>"],
    "description": "<brief description of form purpose>"
  },
  "pdf_fields": [
    {
      "pdf_field_name": "<exact label or identifier from PDF>",
      "pdf_field_type": "<text|number|date|checkbox|signature|address|currency>",
      "page": <page number>,
      "universal_field": "<matching field_key or null if unmapped>",
      "confidence": <0.0 to 1.0>,
      "notes": "<any relevant notes about this field>"
    }
  ],
  "summary": {
    "total_fields": <number>,
    "mapped_fields": <number>,
    "unmapped_fields": <number>,
    "high_confidence": <fields with confidence >= 0.9>,
    "needs_review": <fields with confidence < 0.7>
  }
}

MAPPING GUIDELINES:
- "Purchaser", "Buyer", "Customer" → buyer_* fields
- "Co-Purchaser", "Co-Buyer", "Co-Signer" → co_buyer_* fields
- "Seller", "Dealer", "Dealership" → dealer_* fields
- "VIN", "Vehicle Identification" → vehicle_vin
- "Year/Make/Model" split into vehicle_year, vehicle_make, vehicle_model
- "Odometer", "Mileage" → vehicle_miles
- "Sales Price", "Cash Price", "Selling Price" → sale_price
- "APR", "Annual Percentage Rate" → apr
- "Finance Charge" → finance_charge
- "Total of Payments" → total_of_payments
- Signature lines → *_signature fields
- Date signed → *_signature_date fields

Be thorough - every field matters for accurate form filling.
`;

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, pdf_url, pdf_base64 } = await req.json();

    if (!form_id) throw new Error("form_id is required");
    if (!pdf_url && !pdf_base64) throw new Error("Either pdf_url or pdf_base64 is required");

    // Get form details from database
    const { data: form, error: formError } = await supabase
      .from("form_staging")
      .select("*")
      .eq("id", form_id)
      .single();

    if (formError || !form) {
      throw new Error(`Form not found: ${form_id}`);
    }

    console.log(`[analyze-pdf] Analyzing form: ${form.form_name} (${form.state})`);

    // Get or fetch PDF content
    let pdfData: string;
    let mediaType = "application/pdf";

    if (pdf_base64) {
      // Already have base64 data
      pdfData = pdf_base64;
    } else if (pdf_url) {
      // Fetch PDF from URL
      console.log(`[analyze-pdf] Fetching PDF from: ${pdf_url}`);
      const pdfResponse = await fetch(pdf_url);

      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
      }

      // Check if it's actually a PDF
      const contentType = pdfResponse.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        throw new Error(`URL is a web page, not a PDF. Please upload the actual PDF file.`);
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();

      // Check if the content looks like a PDF (starts with %PDF)
      const firstBytes = new Uint8Array(pdfBuffer.slice(0, 5));
      const header = String.fromCharCode(...firstBytes);
      if (!header.startsWith("%PDF") && !contentType.includes("pdf") && !contentType.includes("octet-stream")) {
        throw new Error(`URL does not contain a valid PDF file. Content-Type: ${contentType}`);
      }

      // Convert to base64 using chunked approach (avoids stack overflow on large files)
      const bytes = new Uint8Array(pdfBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      pdfData = btoa(binary);

      // Check if it's an image (use already-declared contentType)
      if (contentType.includes("image")) {
        mediaType = contentType;
      }

      // If this is an external URL (not our storage), save a copy to our storage
      const isExternalUrl = !pdf_url.includes("supabase.co/storage");
      if (isExternalUrl) {
        try {
          const fileName = `${form.state}/${form.form_name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.pdf`;
          const { error: uploadError } = await supabase.storage
            .from("form-pdfs")
            .upload(fileName, new Uint8Array(pdfBuffer), { contentType: "application/pdf" });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("form-pdfs").getPublicUrl(fileName);
            // Update form with our storage URL
            await supabase.from("form_staging").update({
              source_url: urlData.publicUrl,
              pdf_validated: true,
              url_validated: true,
              url_validated_at: new Date().toISOString()
            }).eq("id", form_id);
            console.log(`[analyze-pdf] Saved PDF to storage: ${fileName}`);
          } else {
            console.log(`[analyze-pdf] Could not save to storage: ${uploadError.message}`);
          }
        } catch (storageErr) {
          console.log(`[analyze-pdf] Storage save failed: ${storageErr.message}`);
        }
      }
    } else {
      throw new Error("No PDF data provided");
    }

    // Call Claude API to analyze the PDF
    console.log(`[analyze-pdf] Calling Claude API...`);

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: pdfData
                }
              },
              {
                type: "text",
                text: buildAnalysisPrompt(form.form_name, form.form_number, form.state)
              }
            ]
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error(`[analyze-pdf] Claude API error:`, errorText);
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    const aiResponseText = claudeData.content[0]?.text || "";

    console.log(`[analyze-pdf] Got AI response, parsing...`);

    // Parse AI response
    let analysis;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = aiResponseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                        aiResponseText.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, aiResponseText];
      const jsonStr = jsonMatch[1] || aiResponseText;
      analysis = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error(`[analyze-pdf] Failed to parse AI response:`, aiResponseText.substring(0, 500));
      throw new Error("Failed to parse AI analysis response");
    }

    // Build suggested mappings array for response
    const suggestedMappings = analysis.pdf_fields
      .filter((f: any) => f.universal_field)
      .map((f: any) => ({
        pdf_field: f.pdf_field_name,
        universal_field: f.universal_field,
        confidence: f.confidence,
        page: f.page,
        field_type: f.pdf_field_type
      }));

    const unmappedFields = analysis.pdf_fields
      .filter((f: any) => !f.universal_field)
      .map((f: any) => f.pdf_field_name);

    // Check if this form already has shared mappings
    const { data: existingShared } = await supabase
      .from("shared_form_mappings")
      .select("id, usage_count")
      .eq("state", form.state)
      .eq("form_name", form.form_name)
      .single();

    // Update form_staging with AI-suggested mappings
    const { error: updateError } = await supabase
      .from("form_staging")
      .update({
        field_mappings: suggestedMappings,
        mapping_status: "ai_suggested",
        deal_types: analysis.form_analysis?.deal_types || form.deal_types
      })
      .eq("id", form_id);

    if (updateError) {
      console.error(`[analyze-pdf] Update error:`, updateError.message);
    }

    // Calculate stats
    const highConfidence = suggestedMappings.filter((m: any) => m.confidence >= 0.9).length;
    const needsReview = suggestedMappings.filter((m: any) => m.confidence < 0.7).length;

    console.log(`[analyze-pdf] Analysis complete: ${suggestedMappings.length} mapped, ${unmappedFields.length} unmapped`);

    return new Response(
      JSON.stringify({
        success: true,
        form_id: form_id,
        form_name: form.form_name,
        state: form.state,

        // Form analysis
        form_analysis: analysis.form_analysis,

        // Field counts
        pdf_fields_found: analysis.pdf_fields?.length || 0,
        mapped_count: suggestedMappings.length,
        unmapped_count: unmappedFields.length,
        high_confidence_count: highConfidence,
        needs_review_count: needsReview,

        // Detailed mappings
        suggested_mappings: suggestedMappings,
        unmapped_fields: unmappedFields,

        // Status
        needs_review: needsReview > 0 || unmappedFields.length > 3,
        mapping_status: "ai_suggested",

        // Shared mapping info
        has_existing_shared_mapping: !!existingShared,
        shared_mapping_usage: existingShared?.usage_count || 0,

        // Next steps
        next_steps: [
          "Review AI-suggested mappings for accuracy",
          "Map any unmapped fields manually",
          "Click 'Verify & Share' to make mappings available to other dealers",
          needsReview > 0 ? `⚠️ ${needsReview} fields need review (low confidence)` : null
        ].filter(Boolean),

        message: `Analyzed ${analysis.pdf_fields?.length || 0} fields. ${suggestedMappings.length} mapped (${highConfidence} high confidence), ${unmappedFields.length} unmapped.`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-pdf] Error:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        hint: error.message.includes("PDF") ?
          "Make sure the PDF URL is accessible or upload the PDF directly" : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
