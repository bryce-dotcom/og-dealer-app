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
  deal: ["purchaser_name", "purchaser_address", "date_of_sale", "price", "down_payment", "sales_tax", "total_price", "vehicle_cash_price", "accessories_total", "rebate_amount", "trade_in_allowance", "trade_in_payoff"],
  financing: ["loan_amount", "interest_rate", "term_months", "monthly_payment", "apr"],
  fees: ["license_fee", "registration_fee", "title_fee", "property_tax_fee", "inspection_fee", "emissions_fee", "waste_tire_fee", "doc_fee", "service_contract_price", "gap_insurance_price", "tax_rate"]
};

const allUniversalFields = Object.entries(universalSchema)
  .flatMap(([category, fields]) => fields.map(f => `${category}.${f}`));

// ============================================
// NORMALIZE FIELD NAMES
// ============================================
function normalizeFieldName(fieldName: string): string {
  return fieldName
    .toLowerCase()
    // Handle camelCase: "buyerName" → "buyer name"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Replace underscores, hyphens, dots with spaces
    .replace(/[_\-\.]/g, ' ')
    // Remove special characters (keep letters, numbers, spaces)
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// AUTO-MAP FIELD NAMES (Pattern Matching)
// ============================================
function autoMapField(pdfFieldName: string): { field: string | null; confidence: number } {
  const name = normalizeFieldName(pdfFieldName);

  // Direct mappings with many variations
  const mappings: Record<string, { field: string; confidence: number }> = {
    // Vehicle - VIN
    'vin': { field: 'vehicle.vin', confidence: 0.98 },
    'vehicle identification number': { field: 'vehicle.vin', confidence: 0.98 },
    'vehicle id number': { field: 'vehicle.vin', confidence: 0.95 },
    'vehicle vin': { field: 'vehicle.vin', confidence: 0.98 },
    'v i n': { field: 'vehicle.vin', confidence: 0.95 },

    // Vehicle - Year
    'year': { field: 'vehicle.year', confidence: 0.95 },
    'vehicle year': { field: 'vehicle.year', confidence: 0.98 },
    'model year': { field: 'vehicle.year', confidence: 0.98 },
    'yr': { field: 'vehicle.year', confidence: 0.9 },

    // Vehicle - Make
    'make': { field: 'vehicle.make', confidence: 0.95 },
    'vehicle make': { field: 'vehicle.make', confidence: 0.98 },
    'manufacturer': { field: 'vehicle.make', confidence: 0.9 },
    'mfg': { field: 'vehicle.make', confidence: 0.85 },

    // Vehicle - Model
    'model': { field: 'vehicle.model', confidence: 0.95 },
    'vehicle model': { field: 'vehicle.model', confidence: 0.98 },

    // Vehicle - Color
    'color': { field: 'vehicle.color', confidence: 0.9 },
    'vehicle color': { field: 'vehicle.color', confidence: 0.95 },
    'exterior color': { field: 'vehicle.color', confidence: 0.95 },

    // Vehicle - Mileage
    'odometer': { field: 'vehicle.mileage', confidence: 0.95 },
    'mileage': { field: 'vehicle.mileage', confidence: 0.95 },
    'miles': { field: 'vehicle.mileage', confidence: 0.85 },
    'odometer reading': { field: 'vehicle.mileage', confidence: 0.98 },
    'current mileage': { field: 'vehicle.mileage', confidence: 0.95 },
    'vehicle mileage': { field: 'vehicle.mileage', confidence: 0.95 },

    // Vehicle - Stock Number
    'stock': { field: 'vehicle.stock_number', confidence: 0.85 },
    'stock number': { field: 'vehicle.stock_number', confidence: 0.95 },
    'stock no': { field: 'vehicle.stock_number', confidence: 0.95 },
    'stock num': { field: 'vehicle.stock_number', confidence: 0.95 },
    'inventory number': { field: 'vehicle.stock_number', confidence: 0.9 },
    'vehicle number': { field: 'vehicle.stock_number', confidence: 0.8 },

    // Deal - Purchaser Name
    'purchaser name': { field: 'deal.purchaser_name', confidence: 0.98 },
    'buyer name': { field: 'deal.purchaser_name', confidence: 0.95 },
    'customer name': { field: 'deal.purchaser_name', confidence: 0.95 },
    'purchaser': { field: 'deal.purchaser_name', confidence: 0.85 },
    'buyer': { field: 'deal.purchaser_name', confidence: 0.8 },
    'name of buyer': { field: 'deal.purchaser_name', confidence: 0.95 },
    'name of purchaser': { field: 'deal.purchaser_name', confidence: 0.98 },

    // Deal - Purchaser Address
    'purchaser address': { field: 'deal.purchaser_address', confidence: 0.98 },
    'buyer address': { field: 'deal.purchaser_address', confidence: 0.95 },
    'customer address': { field: 'deal.purchaser_address', confidence: 0.95 },
    'address of buyer': { field: 'deal.purchaser_address', confidence: 0.95 },
    'address of purchaser': { field: 'deal.purchaser_address', confidence: 0.98 },

    // Deal - Price
    'price': { field: 'deal.price', confidence: 0.8 },
    'sale price': { field: 'deal.price', confidence: 0.95 },
    'selling price': { field: 'deal.price', confidence: 0.9 },
    'purchase price': { field: 'deal.price', confidence: 0.9 },
    'vehicle price': { field: 'deal.price', confidence: 0.9 },
    'sales price': { field: 'deal.price', confidence: 0.95 },
    'cash price': { field: 'deal.vehicle_cash_price', confidence: 0.95 },
    'vehicle cash price': { field: 'deal.vehicle_cash_price', confidence: 0.98 },

    // Deal - Down Payment
    'down payment': { field: 'deal.down_payment', confidence: 0.95 },
    'down': { field: 'deal.down_payment', confidence: 0.8 },
    'deposit': { field: 'deal.down_payment', confidence: 0.85 },
    'initial payment': { field: 'deal.down_payment', confidence: 0.9 },
    'cash down': { field: 'deal.down_payment', confidence: 0.95 },

    // Deal - Trade-In
    'trade in allowance': { field: 'deal.trade_in_allowance', confidence: 0.98 },
    'trade allowance': { field: 'deal.trade_in_allowance', confidence: 0.95 },
    'trade in value': { field: 'deal.trade_in_allowance', confidence: 0.95 },
    'trade value': { field: 'deal.trade_in_allowance', confidence: 0.9 },
    'trade in payoff': { field: 'deal.trade_in_payoff', confidence: 0.98 },
    'trade payoff': { field: 'deal.trade_in_payoff', confidence: 0.95 },

    // Deal - Tax
    'sales tax': { field: 'deal.sales_tax', confidence: 0.95 },
    'tax': { field: 'deal.sales_tax', confidence: 0.75 },
    'tax amount': { field: 'deal.sales_tax', confidence: 0.95 },

    // Deal - Total
    'total': { field: 'deal.total_price', confidence: 0.7 },
    'total price': { field: 'deal.total_price', confidence: 0.95 },
    'grand total': { field: 'deal.total_price', confidence: 0.95 },
    'total amount': { field: 'deal.total_price', confidence: 0.95 },
    'amount due': { field: 'deal.total_price', confidence: 0.9 },

    // Deal - Date
    'date': { field: 'deal.date_of_sale', confidence: 0.7 },
    'date of sale': { field: 'deal.date_of_sale', confidence: 0.98 },
    'sale date': { field: 'deal.date_of_sale', confidence: 0.95 },
    'purchase date': { field: 'deal.date_of_sale', confidence: 0.95 },
    'transaction date': { field: 'deal.date_of_sale', confidence: 0.9 },

    // Financing - APR
    'apr': { field: 'financing.apr', confidence: 0.98 },
    'annual percentage rate': { field: 'financing.apr', confidence: 0.98 },
    'a p r': { field: 'financing.apr', confidence: 0.95 },
    'interest rate': { field: 'financing.interest_rate', confidence: 0.95 },
    'rate': { field: 'financing.interest_rate', confidence: 0.75 },

    // Financing - Term
    'term': { field: 'financing.term_months', confidence: 0.8 },
    'term months': { field: 'financing.term_months', confidence: 0.95 },
    'loan term': { field: 'financing.term_months', confidence: 0.95 },
    'number of months': { field: 'financing.term_months', confidence: 0.9 },
    'months': { field: 'financing.term_months', confidence: 0.7 },
    'no of payments': { field: 'financing.term_months', confidence: 0.85 },
    'number of payments': { field: 'financing.term_months', confidence: 0.85 },

    // Financing - Monthly Payment
    'monthly payment': { field: 'financing.monthly_payment', confidence: 0.95 },
    'payment': { field: 'financing.monthly_payment', confidence: 0.7 },
    'payment amount': { field: 'financing.monthly_payment', confidence: 0.9 },
    'monthly pmt': { field: 'financing.monthly_payment', confidence: 0.95 },
    'mo payment': { field: 'financing.monthly_payment', confidence: 0.95 },

    // Financing - Loan Amount
    'loan amount': { field: 'financing.loan_amount', confidence: 0.95 },
    'amount financed': { field: 'financing.loan_amount', confidence: 0.95 },
    'finance amount': { field: 'financing.loan_amount', confidence: 0.95 },
    'principal': { field: 'financing.loan_amount', confidence: 0.85 },
    'loan principal': { field: 'financing.loan_amount', confidence: 0.95 },

    // Fees - License
    'license fee': { field: 'fees.license_fee', confidence: 0.98 },
    'license': { field: 'fees.license_fee', confidence: 0.85 },
    'license plate fee': { field: 'fees.license_fee', confidence: 0.98 },
    'plate fee': { field: 'fees.license_fee', confidence: 0.95 },

    // Fees - Registration
    'registration fee': { field: 'fees.registration_fee', confidence: 0.98 },
    'registration': { field: 'fees.registration_fee', confidence: 0.85 },
    'vehicle registration': { field: 'fees.registration_fee', confidence: 0.95 },
    'reg fee': { field: 'fees.registration_fee', confidence: 0.95 },

    // Fees - Title
    'title fee': { field: 'fees.title_fee', confidence: 0.98 },
    'title': { field: 'fees.title_fee', confidence: 0.75 },
    'vehicle title fee': { field: 'fees.title_fee', confidence: 0.98 },
    'titling fee': { field: 'fees.title_fee', confidence: 0.95 },

    // Fees - Property Tax
    'property tax': { field: 'fees.property_tax_fee', confidence: 0.95 },
    'property tax fee': { field: 'fees.property_tax_fee', confidence: 0.98 },
    'prop tax': { field: 'fees.property_tax_fee', confidence: 0.95 },
    'vehicle property tax': { field: 'fees.property_tax_fee', confidence: 0.98 },
    'ad valorem tax': { field: 'fees.property_tax_fee', confidence: 0.95 },

    // Fees - Inspection
    'inspection fee': { field: 'fees.inspection_fee', confidence: 0.98 },
    'inspection': { field: 'fees.inspection_fee', confidence: 0.85 },
    'safety inspection': { field: 'fees.inspection_fee', confidence: 0.98 },
    'vehicle inspection': { field: 'fees.inspection_fee', confidence: 0.95 },

    // Fees - Emissions
    'emissions fee': { field: 'fees.emissions_fee', confidence: 0.98 },
    'emissions': { field: 'fees.emissions_fee', confidence: 0.85 },
    'emissions testing': { field: 'fees.emissions_fee', confidence: 0.95 },
    'emission fee': { field: 'fees.emissions_fee', confidence: 0.98 },
    'smog fee': { field: 'fees.emissions_fee', confidence: 0.9 },

    // Fees - Waste Tire
    'waste tire fee': { field: 'fees.waste_tire_fee', confidence: 0.98 },
    'tire fee': { field: 'fees.waste_tire_fee', confidence: 0.95 },
    'tire disposal fee': { field: 'fees.waste_tire_fee', confidence: 0.98 },
    'tire recycling fee': { field: 'fees.waste_tire_fee', confidence: 0.98 },

    // Fees - Doc Fee
    'doc fee': { field: 'fees.doc_fee', confidence: 0.98 },
    'documentation fee': { field: 'fees.doc_fee', confidence: 0.98 },
    'document fee': { field: 'fees.doc_fee', confidence: 0.98 },
    'processing fee': { field: 'fees.doc_fee', confidence: 0.9 },
    'dealer fee': { field: 'fees.doc_fee', confidence: 0.85 },

    // Fees - Service Contract
    'service contract': { field: 'fees.service_contract_price', confidence: 0.95 },
    'service contract price': { field: 'fees.service_contract_price', confidence: 0.98 },
    'warranty': { field: 'fees.service_contract_price', confidence: 0.8 },
    'extended warranty': { field: 'fees.service_contract_price', confidence: 0.9 },

    // Fees - GAP Insurance
    'gap insurance': { field: 'fees.gap_insurance_price', confidence: 0.95 },
    'gap': { field: 'fees.gap_insurance_price', confidence: 0.85 },
    'gap coverage': { field: 'fees.gap_insurance_price', confidence: 0.95 },
    'gap insurance price': { field: 'fees.gap_insurance_price', confidence: 0.98 },

    // Fees - Tax Rate
    'tax rate': { field: 'fees.tax_rate', confidence: 0.95 },
    'sales tax rate': { field: 'fees.tax_rate', confidence: 0.98 },

    // Dealer Info
    'dealer name': { field: 'dealer.dealer_name', confidence: 0.98 },
    'dealership name': { field: 'dealer.dealer_name', confidence: 0.98 },
    'seller name': { field: 'dealer.dealer_name', confidence: 0.9 },
    'dealer license': { field: 'dealer.dealer_license', confidence: 0.98 },
    'dealer license number': { field: 'dealer.dealer_license', confidence: 0.98 },
    'license number': { field: 'dealer.dealer_license', confidence: 0.85 },
    'dealer address': { field: 'dealer.address', confidence: 0.98 },
    'dealership address': { field: 'dealer.address', confidence: 0.98 },
    'dealer phone': { field: 'dealer.phone', confidence: 0.98 },
    'dealer email': { field: 'dealer.email', confidence: 0.98 },
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

  // Fee pattern matching
  if (name.includes('license') && name.includes('fee')) {
    return { field: 'fees.license_fee', confidence: 0.9 };
  }
  if (name.includes('registration') && name.includes('fee')) {
    return { field: 'fees.registration_fee', confidence: 0.9 };
  }
  if (name.includes('title') && name.includes('fee')) {
    return { field: 'fees.title_fee', confidence: 0.9 };
  }
  if (name.includes('property') && name.includes('tax')) {
    return { field: 'fees.property_tax_fee', confidence: 0.9 };
  }
  if (name.includes('inspection') && name.includes('fee')) {
    return { field: 'fees.inspection_fee', confidence: 0.9 };
  }
  if (name.includes('emission') && name.includes('fee')) {
    return { field: 'fees.emissions_fee', confidence: 0.9 };
  }
  if (name.includes('tire') && name.includes('fee')) {
    return { field: 'fees.waste_tire_fee', confidence: 0.9 };
  }
  if ((name.includes('doc') || name.includes('documentation')) && name.includes('fee')) {
    return { field: 'fees.doc_fee', confidence: 0.9 };
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
- deal: purchaser_name, purchaser_address, date_of_sale, price, down_payment, sales_tax, total_price, vehicle_cash_price, accessories_total, rebate_amount, trade_in_allowance, trade_in_payoff
- financing: loan_amount, interest_rate, term_months, monthly_payment, apr
- fees: license_fee, registration_fee, title_fee, property_tax_fee, inspection_fee, emissions_fee, waste_tire_fee, doc_fee, service_contract_price, gap_insurance_price, tax_rate

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
    const { form_id, source_table, debug } = await req.json();
    if (!form_id) throw new Error("form_id is required");

    console.log(`[MAP] Starting field mapping for form: ${form_id}${source_table ? ` (source: ${source_table})` : ''}${debug ? ' (DEBUG MODE)' : ''}`);

    // Get form - check source_table first if specified, then fall through all tables
    let form: any = null;
    let formError: any = null;
    let sourceTable: string = "";

    const tablesToCheck = source_table
      ? [source_table, "form_staging", "form_registry", "form_library", "dealer_custom_forms"]
      : ["form_staging", "form_registry", "form_library", "dealer_custom_forms"];

    // Deduplicate while preserving order
    const uniqueTables = [...new Set(tablesToCheck)];

    for (const table of uniqueTables) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", form_id)
        .single();

      if (data) {
        form = data;
        sourceTable = table;
        console.log(`[MAP] Found form in ${table}`);
        break;
      }
      if (!formError) formError = error;
    }

    if (!form) {
      throw new Error(`Form not found in any table: ${formError?.message || form_id}`);
    }

    console.log(`[MAP] Form: ${form.form_name} (${form.state})`);

    // Debug mode: return diagnostic info without processing
    if (debug) {
      return new Response(
        JSON.stringify({
          debug: true,
          form_id,
          sourceTable,
          form_name: form.form_name,
          state: form.state,
          storage_bucket: form.storage_bucket || null,
          storage_path: form.storage_path || null,
          download_url: form.download_url || null,
          source_url: form.source_url || null,
          has_storage: !!(form.storage_bucket && form.storage_path),
          message: "Debug mode - form found, no processing done"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let pdfBytes: Uint8Array;

    try {
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
      if (!pdfBytes) {
        const pdfUrl = form.download_url || form.source_url;
        if (!pdfUrl) {
          throw new Error("Form has no PDF in storage and no URL. Please upload a PDF first.");
        }

        console.log(`[MAP] Fetching PDF from URL: ${pdfUrl}`);

        const pdfResponse = await fetch(pdfUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });

        if (!pdfResponse.ok) {
          throw new Error(`Failed to download PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
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
    } catch (pdfDownloadError) {
      console.error(`[MAP] PDF download error:`, pdfDownloadError);
      throw new Error(`Failed to download PDF: ${pdfDownloadError.message}. Form storage: ${form.storage_bucket || 'none'}/${form.storage_path || 'none'}, URL: ${form.download_url || form.source_url || 'none'}`);
    }

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
        mapping_status: mappingConfidence >= 70 ? "ai_suggested" : "pending",
        analyzed_at: new Date().toISOString()
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
    console.error("[MAP] Error stack:", error.stack);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        error_type: error.name,
        stack: error.stack
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
