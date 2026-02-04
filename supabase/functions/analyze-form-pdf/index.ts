import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// UNIVERSAL FIELDS - for AI context and auto-mapping
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
    "vehicle_plate", "vehicle_weight", "vehicle_new_used", "vehicle_warranty",
    "year", "make", "model", "vin", "odometer", "color", "stock_number", "body_type"
  ],
  deal: [
    "sale_date", "delivery_date", "deal_number", "sale_price", "msrp",
    "trade_allowance", "trade_payoff", "net_trade", "down_payment", "rebate",
    "doc_fee", "title_fee", "registration_fee", "smog_fee", "other_fees",
    "other_fees_desc", "total_fees", "subtotal", "tax_rate", "tax_amount",
    "total_price", "amount_financed", "balance_due", "sales_tax", "total_sale"
  ],
  financing: [
    "apr", "term_months", "monthly_payment", "payment_frequency", "num_payments",
    "first_payment_date", "final_payment_date", "final_payment_amount",
    "total_of_payments", "finance_charge", "total_sale_price", "deferred_price",
    "late_fee", "late_days", "prepayment_penalty", "interest_rate"
  ],
  trade: [
    "trade_year", "trade_make", "trade_model", "trade_vin", "trade_miles",
    "trade_color", "trade_title_number", "trade_plate", "trade_lienholder",
    "trade_lienholder_address", "trade_payoff_good_thru", "trade_value", "trade_description"
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

// Flatten all fields for pattern matching
const allUniversalFields = Object.values(universalFieldCategories).flat();

// ============================================
// AUTO-MAPPING: Pattern matching for PDF field names
// ============================================
function autoMapFieldName(pdfFieldName: string): { field: string | null; confidence: number } {
  const nameLower = pdfFieldName.toLowerCase().trim();

  // Direct matches first
  const directMappings: Record<string, { field: string; confidence: number }> = {
    // Vehicle fields
    'year': { field: 'vehicle_year', confidence: 0.95 },
    'make': { field: 'vehicle_make', confidence: 0.95 },
    'model': { field: 'vehicle_model', confidence: 0.95 },
    'vin': { field: 'vehicle_vin', confidence: 0.98 },
    'color': { field: 'vehicle_color', confidence: 0.9 },
    'body': { field: 'vehicle_body', confidence: 0.85 },
    'body type': { field: 'vehicle_body', confidence: 0.9 },
    'body_type': { field: 'vehicle_body', confidence: 0.95 },
    'body style': { field: 'vehicle_body', confidence: 0.9 },
    'odometer': { field: 'odometer', confidence: 0.95 },
    'mileage': { field: 'odometer', confidence: 0.9 },
    'miles': { field: 'odometer', confidence: 0.85 },
    'units': { field: 'odometer', confidence: 0.7 },
    'stock': { field: 'stock_number', confidence: 0.85 },
    'stock number': { field: 'stock_number', confidence: 0.95 },
    'stock #': { field: 'stock_number', confidence: 0.95 },

    // Price fields
    'price': { field: 'sale_price', confidence: 0.85 },
    'sale price': { field: 'sale_price', confidence: 0.95 },
    'selling price': { field: 'sale_price', confidence: 0.9 },
    'purchase price': { field: 'sale_price', confidence: 0.9 },
    'amount': { field: 'sale_price', confidence: 0.6 },

    // Date fields
    'date': { field: 'sale_date', confidence: 0.7 },
    'date of sale': { field: 'sale_date', confidence: 0.98 },
    'sale date': { field: 'sale_date', confidence: 0.98 },
    'sold date': { field: 'sale_date', confidence: 0.95 },
    'today': { field: 'sale_date', confidence: 0.7 },
  };

  // Check direct mappings
  if (directMappings[nameLower]) {
    return directMappings[nameLower];
  }

  // Pattern-based mappings
  // VIN patterns
  if (nameLower.includes('vin') || nameLower.includes('vehicle identification')) {
    return { field: 'vehicle_vin', confidence: 0.95 };
  }

  // Odometer patterns
  if (nameLower.includes('odometer') || nameLower.includes('mileage')) {
    return { field: 'odometer', confidence: 0.9 };
  }

  // Buyer patterns - look for _2 suffix or "buyer" keyword
  if (nameLower.includes('buyer') || nameLower.includes('purchaser') || nameLower.includes('customer')) {
    if (nameLower.includes('name')) return { field: 'buyer_name', confidence: 0.95 };
    if (nameLower.includes('address')) return { field: 'buyer_address', confidence: 0.9 };
    if (nameLower.includes('city')) return { field: 'buyer_city', confidence: 0.9 };
    if (nameLower.includes('state')) return { field: 'buyer_state', confidence: 0.9 };
    if (nameLower.includes('zip')) return { field: 'buyer_zip', confidence: 0.9 };
    if (nameLower.includes('phone')) return { field: 'buyer_phone', confidence: 0.9 };
    if (nameLower.includes('email')) return { field: 'buyer_email', confidence: 0.9 };
  }

  // Fields with _2 suffix often indicate buyer (second party)
  if (nameLower.endsWith('_2') || nameLower.includes('_2_')) {
    const base = nameLower.replace(/_2/g, '').trim();
    if (base.includes('address') || base === 'street address') return { field: 'buyer_address', confidence: 0.85 };
    if (base.includes('city') || base === 'city') return { field: 'buyer_city', confidence: 0.85 };
    if (base.includes('state') || base === 'state') return { field: 'buyer_state', confidence: 0.85 };
    if (base.includes('zip') || base === 'zip') return { field: 'buyer_zip', confidence: 0.85 };
  }

  // Dealer/Seller patterns - fields without _2 suffix
  if (nameLower.includes('dealer') || nameLower.includes('seller')) {
    if (nameLower.includes('name')) return { field: 'dealer_name', confidence: 0.95 };
    if (nameLower.includes('license')) return { field: 'dealer_license', confidence: 0.95 };
    if (nameLower.includes('address')) return { field: 'dealer_address', confidence: 0.9 };
    if (nameLower.includes('city')) return { field: 'dealer_city', confidence: 0.9 };
    if (nameLower.includes('state')) return { field: 'dealer_state', confidence: 0.9 };
    if (nameLower.includes('zip')) return { field: 'dealer_zip', confidence: 0.9 };
    if (nameLower.includes('phone')) return { field: 'dealer_phone', confidence: 0.9 };
  }

  // Address fields without buyer/dealer context - assume dealer (first party)
  if (!nameLower.includes('_2') && !nameLower.includes('buyer') && !nameLower.includes('purchaser')) {
    if (nameLower === 'street address' || nameLower === 'address') return { field: 'dealer_address', confidence: 0.7 };
    if (nameLower === 'city') return { field: 'dealer_city', confidence: 0.7 };
    if (nameLower === 'state') return { field: 'dealer_state', confidence: 0.7 };
    if (nameLower === 'zip' || nameLower === 'zip code') return { field: 'dealer_zip', confidence: 0.7 };
  }

  // Trade-in patterns
  if (nameLower.includes('trade')) {
    if (nameLower.includes('value') || nameLower.includes('allowance')) return { field: 'trade_value', confidence: 0.9 };
    if (nameLower.includes('payoff')) return { field: 'trade_payoff', confidence: 0.9 };
    if (nameLower.includes('vin')) return { field: 'trade_vin', confidence: 0.9 };
  }

  // Financing patterns
  if (nameLower.includes('apr') || nameLower.includes('annual percentage')) {
    return { field: 'apr', confidence: 0.95 };
  }
  if (nameLower.includes('monthly payment') || nameLower.includes('payment amount')) {
    return { field: 'monthly_payment', confidence: 0.9 };
  }
  if (nameLower.includes('term') && nameLower.includes('month')) {
    return { field: 'term_months', confidence: 0.9 };
  }
  if (nameLower.includes('down payment')) {
    return { field: 'down_payment', confidence: 0.95 };
  }
  if (nameLower.includes('amount financed')) {
    return { field: 'amount_financed', confidence: 0.95 };
  }
  if (nameLower.includes('finance charge')) {
    return { field: 'finance_charge', confidence: 0.95 };
  }
  if (nameLower.includes('total of payments')) {
    return { field: 'total_of_payments', confidence: 0.95 };
  }

  // Sales tax
  if (nameLower.includes('sales tax') || nameLower.includes('tax amount')) {
    return { field: 'sales_tax', confidence: 0.9 };
  }

  // Doc fee
  if (nameLower.includes('doc fee') || nameLower.includes('documentation fee')) {
    return { field: 'doc_fee', confidence: 0.95 };
  }

  // Total price
  if (nameLower.includes('total price') || nameLower.includes('total sale')) {
    return { field: 'total_price', confidence: 0.9 };
  }

  return { field: null, confidence: 0 };
}

// ============================================
// PDF ANALYSIS PROMPT FOR AI FALLBACK
// ============================================
const buildAnalysisPrompt = (formName: string, formNumber: string | null, state: string) => `
You are analyzing a PDF form used by auto dealers. Identify all fillable fields and map them to our universal field system.

FORM: ${formName} (${formNumber || 'Unknown'}) - ${state}

UNIVERSAL FIELDS AVAILABLE:
${Object.entries(universalFieldCategories).map(([cat, fields]) => `${cat}: ${fields.join(', ')}`).join('\n')}

RESPOND WITH VALID JSON:
{
  "form_analysis": {
    "total_pages": <number>,
    "form_type": "<deal|title|financing|disclosure|tax|compliance>",
    "deal_types": ["<cash|bhph|traditional|wholesale>"],
    "description": "<brief description>"
  },
  "pdf_fields": [
    {
      "pdf_field_name": "<exact field label from PDF>",
      "pdf_field_type": "<text|number|date|checkbox|signature>",
      "page": <page>,
      "universal_field": "<matching field_key or null>",
      "confidence": <0.0 to 1.0>,
      "notes": "<any notes>"
    }
  ]
}

MAPPING HINTS:
- "Purchaser", "Buyer", "Customer" → buyer_*
- "Seller", "Dealer" → dealer_*
- "VIN" → vehicle_vin
- "Odometer", "Mileage" → odometer
- Signature lines → *_signature
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

    console.log(`[ANALYZE] Starting analysis for form_id: ${form_id}`);

    // Get form details
    const { data: form, error: formError } = await supabase
      .from("form_staging")
      .select("*")
      .eq("id", form_id)
      .single();

    if (formError || !form) {
      throw new Error(`Form not found: ${form_id} - ${formError?.message || 'Unknown'}`);
    }

    console.log(`[ANALYZE] Form: ${form.form_name} (${form.state})`);
    console.log(`[ANALYZE] PDF URL: ${pdf_url}`);

    // Get or fetch PDF content
    let pdfBytes: Uint8Array;

    if (pdf_base64) {
      console.log(`[ANALYZE] Using provided base64 data`);
      pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));
    } else if (pdf_url) {
      console.log(`[ANALYZE] Fetching PDF from: ${pdf_url}`);

      const pdfResponse = await fetch(pdf_url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });

      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
      }

      const contentType = pdfResponse.headers.get("content-type") || "";
      console.log(`[ANALYZE] Content-Type: ${contentType}`);

      if (contentType.includes("text/html")) {
        throw new Error(`URL returned HTML, not PDF. The link may require login or has changed.`);
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();
      pdfBytes = new Uint8Array(pdfBuffer);

      console.log(`[ANALYZE] Downloaded ${pdfBytes.length} bytes`);

      // Verify PDF header
      const header = String.fromCharCode(...pdfBytes.slice(0, 5));
      if (!header.startsWith("%PDF")) {
        throw new Error(`File is not a valid PDF (header: ${header})`);
      }

      // If external URL, save to our storage
      if (!pdf_url.includes("supabase.co/storage")) {
        try {
          const fileName = `${form.state}/${form.form_name.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.pdf`;
          const { error: uploadError } = await supabase.storage
            .from("form-pdfs")
            .upload(fileName, pdfBytes, { contentType: "application/pdf" });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("form-pdfs").getPublicUrl(fileName);
            await supabase.from("form_staging").update({
              source_url: urlData.publicUrl,
              pdf_validated: true,
              url_validated: true,
              url_validated_at: new Date().toISOString()
            }).eq("id", form_id);
            console.log(`[ANALYZE] Saved PDF to storage: ${fileName}`);
          }
        } catch (storageErr) {
          console.log(`[ANALYZE] Storage save failed (non-fatal): ${storageErr}`);
        }
      }
    } else {
      throw new Error("No PDF data provided");
    }

    // ============================================
    // EXTRACT PDF FIELDS using pdf-lib
    // ============================================
    let actualPdfFields: { name: string; type: string }[] = [];
    let extractionMethod = 'pdf-lib';

    try {
      console.log(`[ANALYZE] Loading PDF with pdf-lib...`);
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pdfForm = pdfDoc.getForm();
      const fields = pdfForm.getFields();

      actualPdfFields = fields.map(field => ({
        name: field.getName(),
        type: field.constructor.name.replace('PDF', '').replace('Field', '')
      }));

      console.log(`[ANALYZE] Extracted ${actualPdfFields.length} fillable fields from PDF`);

      if (actualPdfFields.length > 0) {
        console.log(`[ANALYZE] Field names:`);
        actualPdfFields.slice(0, 30).forEach((f, i) => {
          console.log(`  ${i + 1}. "${f.name}" (${f.type})`);
        });
        if (actualPdfFields.length > 30) {
          console.log(`  ... and ${actualPdfFields.length - 30} more fields`);
        }
      }
    } catch (pdfLibErr) {
      console.log(`[ANALYZE] pdf-lib extraction failed: ${pdfLibErr}`);
      console.log(`[ANALYZE] PDF may be encrypted or have no fillable fields`);
    }

    // ============================================
    // BUILD FIELD MAPPINGS
    // ============================================
    let fieldMappings: any[] = [];
    let mappedCount = 0;
    let unmappedCount = 0;

    if (actualPdfFields.length > 0) {
      // Use extracted PDF field names and auto-map them
      console.log(`[ANALYZE] Auto-mapping ${actualPdfFields.length} PDF fields...`);

      fieldMappings = actualPdfFields.map((f, idx) => {
        const autoMap = autoMapFieldName(f.name);

        const mapping = {
          pdf_field: f.name,
          pdf_field_name: f.name, // Alias for compatibility
          pdf_field_type: f.type,
          universal_field: autoMap.field,
          universal_fields: autoMap.field ? [autoMap.field] : [],
          confidence: autoMap.confidence,
          matched: !!autoMap.field,
          status: autoMap.field ? 'mapped' : 'unmapped',
          notes: autoMap.field ? `Auto-mapped (${Math.round(autoMap.confidence * 100)}% confidence)` : 'Needs manual mapping'
        };

        if (mapping.matched) mappedCount++;
        else unmappedCount++;

        return mapping;
      });

      console.log(`[ANALYZE] Auto-mapping complete: ${mappedCount} mapped, ${unmappedCount} unmapped`);

    } else {
      // No fillable fields - fall back to AI visual analysis
      console.log(`[ANALYZE] No fillable fields found, falling back to AI analysis...`);
      extractionMethod = 'ai-visual';

      if (!anthropicApiKey) {
        throw new Error("PDF has no fillable fields and ANTHROPIC_API_KEY is not set for visual analysis");
      }

      // Convert to base64 for Claude
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < pdfBytes.length; i += chunkSize) {
        const chunk = pdfBytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const pdfBase64 = btoa(binary);

      console.log(`[ANALYZE] Calling Claude API for visual analysis...`);

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
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: buildAnalysisPrompt(form.form_name, form.form_number, form.state) }
            ]
          }]
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error(`[ANALYZE] Claude API error:`, errorText);
        throw new Error(`Claude API error: ${claudeResponse.status}`);
      }

      const claudeData = await claudeResponse.json();
      const aiText = claudeData.content[0]?.text || "";

      console.log(`[ANALYZE] Got AI response, parsing...`);

      // Parse AI response
      let analysis;
      try {
        const jsonMatch = aiText.match(/```json\s*([\s\S]*?)\s*```/) ||
                          aiText.match(/```\s*([\s\S]*?)\s*```/) ||
                          [null, aiText];
        analysis = JSON.parse((jsonMatch[1] || aiText).trim());
      } catch (parseError) {
        console.error(`[ANALYZE] Failed to parse AI response`);
        throw new Error("Failed to parse AI analysis response");
      }

      // Convert AI response to field mappings
      fieldMappings = (analysis.pdf_fields || []).map((f: any, idx: number) => {
        let pdfFieldName = f.pdf_field_name;
        if (!pdfFieldName || typeof pdfFieldName !== 'string' || pdfFieldName.trim() === '') {
          pdfFieldName = `Field_${idx + 1}`;
        }

        const mapping = {
          pdf_field: pdfFieldName.trim(),
          pdf_field_name: pdfFieldName.trim(),
          pdf_field_type: f.pdf_field_type || 'text',
          page: f.page,
          universal_field: f.universal_field || null,
          universal_fields: f.universal_field ? [f.universal_field] : [],
          confidence: f.confidence || 0,
          matched: !!f.universal_field,
          status: f.universal_field ? 'mapped' : 'unmapped',
          notes: f.notes || null
        };

        if (mapping.matched) mappedCount++;
        else unmappedCount++;

        return mapping;
      });

      console.log(`[ANALYZE] AI analysis: ${mappedCount} mapped, ${unmappedCount} unmapped`);
    }

    // ============================================
    // UPDATE DATABASE
    // ============================================
    const totalFields = fieldMappings.length;
    const mappingConfidence = totalFields > 0 ? Math.round((mappedCount / totalFields) * 100) : 0;

    console.log(`[ANALYZE] Updating database...`);
    console.log(`[ANALYZE] Total fields: ${totalFields}, Mapped: ${mappedCount}, Confidence: ${mappingConfidence}%`);

    const updateData: any = {
      field_mappings: fieldMappings,
      detected_fields: fieldMappings.map(f => f.pdf_field),
      mapping_status: extractionMethod === 'pdf-lib' ? 'extracted' : 'ai_suggested',
      mapping_confidence: mappingConfidence,
      analyzed_at: new Date().toISOString(),
      is_fillable: actualPdfFields.length > 0
    };

    const { error: updateError } = await supabase
      .from("form_staging")
      .update(updateData)
      .eq("id", form_id);

    if (updateError) {
      console.error(`[ANALYZE] Database update failed:`, updateError);
      throw new Error(`Failed to save analysis: ${updateError.message}`);
    }

    console.log(`[ANALYZE] Database updated successfully`);

    // ============================================
    // RETURN RESPONSE
    // ============================================
    const response = {
      success: true,
      form_id: form_id,
      form_name: form.form_name,
      form_number: form.form_number,
      state: form.state,

      // Field counts - use pdf_fields_found for frontend compatibility
      pdf_fields_found: totalFields,
      total_fields: totalFields,
      mapped_count: mappedCount,
      unmapped_count: unmappedCount,
      mapping_confidence: mappingConfidence,

      // Extraction method
      extraction_method: extractionMethod,
      is_fillable: actualPdfFields.length > 0,

      // All fields with mappings
      all_fields: fieldMappings,
      actual_pdf_fields: actualPdfFields,

      // Status
      needs_review: unmappedCount > 0,
      mapping_status: updateData.mapping_status,

      message: `Analyzed ${totalFields} fields. ${mappedCount} auto-mapped (${mappingConfidence}%), ${unmappedCount} need manual mapping.`
    };

    console.log(`[ANALYZE] Complete: ${response.message}`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ANALYZE] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        hint: "Make sure the PDF URL is accessible and points to a valid PDF file"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
