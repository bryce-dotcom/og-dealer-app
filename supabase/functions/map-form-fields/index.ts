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
// OUR UNIVERSAL DATA SCHEMA FOR MAPPING
// ============================================
const universalSchema = {
  dealer: ["dealer_name", "dealer_license", "address", "city", "state", "zip", "phone", "email"],
  vehicle: ["vin", "year", "make", "model", "trim", "color", "mileage", "stock_number"],
  deal: ["purchaser_name", "purchaser_address", "date_of_sale", "price", "down_payment", "sales_tax", "total_price"],
  financing: ["loan_amount", "interest_rate", "term_months", "monthly_payment", "apr"]
};

const allUniversalFields = Object.entries(universalSchema)
  .flatMap(([category, fields]) => fields.map(f => `${category}.${f}`));

// ============================================
// AUTO-MAP FIELD NAMES (Pattern Matching)
// ============================================
function autoMapField(pdfFieldName: string): { field: string | null; confidence: number } {
  const name = pdfFieldName.toLowerCase().trim();

  // Direct mappings
  const mappings: Record<string, { field: string; confidence: number }> = {
    // Vehicle
    'vin': { field: 'vehicle.vin', confidence: 0.98 },
    'year': { field: 'vehicle.year', confidence: 0.95 },
    'make': { field: 'vehicle.make', confidence: 0.95 },
    'model': { field: 'vehicle.model', confidence: 0.95 },
    'color': { field: 'vehicle.color', confidence: 0.9 },
    'odometer': { field: 'vehicle.mileage', confidence: 0.95 },
    'mileage': { field: 'vehicle.mileage', confidence: 0.9 },
    'miles': { field: 'vehicle.mileage', confidence: 0.85 },
    'stock': { field: 'vehicle.stock_number', confidence: 0.85 },
    'stock number': { field: 'vehicle.stock_number', confidence: 0.95 },

    // Deal
    'price': { field: 'deal.price', confidence: 0.8 },
    'sale price': { field: 'deal.price', confidence: 0.95 },
    'selling price': { field: 'deal.price', confidence: 0.9 },
    'purchase price': { field: 'deal.price', confidence: 0.9 },
    'down payment': { field: 'deal.down_payment', confidence: 0.95 },
    'sales tax': { field: 'deal.sales_tax', confidence: 0.95 },
    'total': { field: 'deal.total_price', confidence: 0.7 },
    'total price': { field: 'deal.total_price', confidence: 0.95 },
    'date': { field: 'deal.date_of_sale', confidence: 0.7 },
    'date of sale': { field: 'deal.date_of_sale', confidence: 0.98 },
    'sale date': { field: 'deal.date_of_sale', confidence: 0.95 },

    // Financing
    'apr': { field: 'financing.apr', confidence: 0.98 },
    'interest rate': { field: 'financing.interest_rate', confidence: 0.95 },
    'term': { field: 'financing.term_months', confidence: 0.8 },
    'months': { field: 'financing.term_months', confidence: 0.7 },
    'monthly payment': { field: 'financing.monthly_payment', confidence: 0.95 },
    'payment': { field: 'financing.monthly_payment', confidence: 0.7 },
    'loan amount': { field: 'financing.loan_amount', confidence: 0.95 },
    'amount financed': { field: 'financing.loan_amount', confidence: 0.9 },
  };

  if (mappings[name]) return mappings[name];

  // Pattern matching
  if (name.includes('vin') || name.includes('vehicle identification')) {
    return { field: 'vehicle.vin', confidence: 0.9 };
  }
  if (name.includes('odometer') || name.includes('mileage')) {
    return { field: 'vehicle.mileage', confidence: 0.85 };
  }
  if (name.includes('buyer') && name.includes('name')) {
    return { field: 'deal.purchaser_name', confidence: 0.9 };
  }
  if (name.includes('purchaser') && name.includes('name')) {
    return { field: 'deal.purchaser_name', confidence: 0.95 };
  }
  if (name.includes('buyer') && name.includes('address')) {
    return { field: 'deal.purchaser_address', confidence: 0.9 };
  }
  if (name.includes('dealer') && name.includes('name')) {
    return { field: 'dealer.dealer_name', confidence: 0.95 };
  }
  if (name.includes('dealer') && name.includes('license')) {
    return { field: 'dealer.dealer_license', confidence: 0.95 };
  }
  if (name.includes('dealer') && name.includes('address')) {
    return { field: 'dealer.address', confidence: 0.9 };
  }
  if (name.includes('apr') || name.includes('annual percentage')) {
    return { field: 'financing.apr', confidence: 0.9 };
  }

  return { field: null, confidence: 0 };
}

// ============================================
// AI MAPPING PROMPT
// ============================================
function buildMappingPrompt(formName: string, pdfFields: { name: string; type: string }[]): string {
  const fieldsList = pdfFields.map(f => `- "${f.name}" (${f.type})`).join('\n');

  return `You are mapping PDF form fields to a dealer management system schema.

FORM: ${formName}

PDF FIELDS FOUND:
${fieldsList}

OUR UNIVERSAL SCHEMA:
- dealer: dealer_name, dealer_license, address, city, state, zip, phone, email
- vehicle: vin, year, make, model, trim, color, mileage, stock_number
- deal: purchaser_name, purchaser_address, date_of_sale, price, down_payment, sales_tax, total_price
- financing: loan_amount, interest_rate, term_months, monthly_payment, apr

RESPOND WITH VALID JSON ONLY - an array of mappings:
[
  {
    "pdf_field": "exact PDF field name",
    "universal_field": "category.field_name or null if no match",
    "confidence": 0.0 to 1.0
  }
]

Map each PDF field to the most appropriate universal field. Use null for fields that don't match our schema (like signature fields, checkboxes, etc).`;
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id } = await req.json();
    if (!form_id) throw new Error("form_id is required");

    console.log(`[MAP] Starting field mapping for form: ${form_id}`);

    // Get form from staging table first, then fall back to registry
    let form: any = null;
    let formError: any = null;
    let sourceTable: string = "form_staging"; // Track which table we found the form in

    // Try form_staging first (where discovered forms go)
    const { data: stagingForm, error: stagingError } = await supabase
      .from("form_staging")
      .select("*")
      .eq("id", form_id)
      .single();

    if (stagingForm) {
      form = stagingForm;
      sourceTable = "form_staging";
      console.log(`[MAP] Found form in form_staging`);
    } else {
      // Fall back to form_registry (production forms)
      const { data: registryForm, error: registryError } = await supabase
        .from("form_registry")
        .select("*")
        .eq("id", form_id)
        .single();

      if (registryForm) {
        form = registryForm;
        sourceTable = "form_registry";
        console.log(`[MAP] Found form in form_registry`);
      } else {
        formError = stagingError || registryError;
      }
    }

    if (!form) {
      throw new Error(`Form not found in staging or registry: ${formError?.message || form_id}`);
    }

    console.log(`[MAP] Form: ${form.form_name} (${form.state})`);

    let pdfBytes: Uint8Array;

    // Try to get PDF from storage first (most reliable)
    if (form.storage_bucket && form.storage_path) {
      console.log(`[MAP] Reading from storage: ${form.storage_bucket}/${form.storage_path}`);

      const { data: storageData, error: storageError } = await supabase.storage
        .from(form.storage_bucket)
        .download(form.storage_path);

      if (storageError) {
        console.log(`[MAP] Storage read failed: ${storageError.message}, trying URL fallback`);
      } else if (storageData) {
        pdfBytes = new Uint8Array(await storageData.arrayBuffer());
        console.log(`[MAP] Loaded ${pdfBytes.length} bytes from storage`);
      }
    }

    // Fallback to URL if storage didn't work
    if (!pdfBytes!) {
      const pdfUrl = form.download_url || form.source_url;
      if (!pdfUrl) {
        throw new Error("Form has no PDF in storage and no URL. Please upload a PDF first.");
      }

      console.log(`[MAP] Fetching PDF from URL: ${pdfUrl}`);

      const pdfResponse = await fetch(pdfUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });

      if (!pdfResponse.ok) {
        throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
      }

      const pdfBuffer = await pdfResponse.arrayBuffer();
      pdfBytes = new Uint8Array(pdfBuffer);
    }

    // Verify PDF
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    if (!header.startsWith("%PDF")) {
      throw new Error("URL does not contain a valid PDF file");
    }

    console.log(`[MAP] Downloaded PDF: ${pdfBytes.length} bytes`);

    // ============================================
    // EXTRACT PDF FIELDS using pdf-lib
    // ============================================
    let detectedFields: { name: string; type: string }[] = [];

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pdfForm = pdfDoc.getForm();
      const fields = pdfForm.getFields();

      detectedFields = fields.map(field => ({
        name: field.getName(),
        type: field.constructor.name.replace('PDF', '').replace('Field', '')
      }));

      console.log(`[MAP] Extracted ${detectedFields.length} fillable fields:`);
      detectedFields.slice(0, 20).forEach((f, i) => {
        console.log(`  ${i + 1}. "${f.name}" (${f.type})`);
      });

    } catch (pdfErr) {
      console.log(`[MAP] pdf-lib extraction failed: ${pdfErr}`);
      throw new Error("PDF has no fillable form fields or is encrypted");
    }

    if (detectedFields.length === 0) {
      throw new Error("PDF has no fillable form fields");
    }

    // ============================================
    // CREATE FIELD MAPPINGS
    // ============================================
    let fieldMappings: any[] = [];
    let mappedCount = 0;

    // First, try auto-mapping
    for (const field of detectedFields) {
      const autoMap = autoMapField(field.name);
      fieldMappings.push({
        pdf_field: field.name,
        pdf_field_type: field.type,
        universal_field: autoMap.field,
        confidence: autoMap.confidence,
        auto_mapped: !!autoMap.field
      });
      if (autoMap.field) mappedCount++;
    }

    console.log(`[MAP] Auto-mapped ${mappedCount}/${detectedFields.length} fields`);

    // If many fields unmapped, use AI to help
    const unmappedCount = detectedFields.length - mappedCount;
    if (unmappedCount > 3 && anthropicApiKey) {
      console.log(`[MAP] Calling AI to help map ${unmappedCount} unmapped fields...`);

      try {
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4000,
            messages: [{
              role: "user",
              content: buildMappingPrompt(form.form_name, detectedFields)
            }]
          })
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiText = aiData.content[0]?.text || "";

          // Parse AI response
          const jsonMatch = aiText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const aiMappings = JSON.parse(jsonMatch[0]);

            // Merge AI mappings with auto-mappings (prefer AI for unmapped fields)
            for (const aiMap of aiMappings) {
              const existing = fieldMappings.find(f => f.pdf_field === aiMap.pdf_field);
              if (existing && !existing.universal_field && aiMap.universal_field) {
                existing.universal_field = aiMap.universal_field;
                existing.confidence = aiMap.confidence || 0.8;
                existing.ai_mapped = true;
                mappedCount++;
              }
            }

            console.log(`[MAP] AI helped map additional fields. Total mapped: ${mappedCount}`);
          }
        }
      } catch (aiErr) {
        console.log(`[MAP] AI mapping failed (non-fatal): ${aiErr}`);
      }
    }

    // Calculate mapping confidence
    const mappingConfidence = Math.round((mappedCount / detectedFields.length) * 100);

    // ============================================
    // UPDATE DATABASE (same table we read from)
    // ============================================
    const { error: updateError } = await supabase
      .from(sourceTable)
      .update({
        is_fillable: true,
        detected_fields: detectedFields.map(f => f.name),
        field_mappings: fieldMappings,
        mapping_confidence: mappingConfidence,
        status: mappingConfidence >= 70 ? "active" : "pending",
        updated_at: new Date().toISOString()
      })
      .eq("id", form_id);

    if (updateError) {
      throw new Error(`Failed to save mappings: ${updateError.message}`);
    }

    console.log(`[MAP] Complete: ${mappedCount}/${detectedFields.length} mapped (${mappingConfidence}%)`);

    return new Response(
      JSON.stringify({
        success: true,
        form_id: form_id,
        form_name: form.form_name,
        detected_fields_count: detectedFields.length,
        mapped_count: mappedCount,
        unmapped_count: detectedFields.length - mappedCount,
        mapping_confidence: mappingConfidence,
        detected_fields: detectedFields,
        field_mappings: fieldMappings,
        message: `Mapped ${mappedCount}/${detectedFields.length} fields (${mappingConfidence}% confidence)`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[MAP] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
