import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { TEMPLATES } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// FORMATTERS
// ============================================
function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function formatCurrency(value: number | string | null): string {
  const num = parseFloat(String(value)) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number | string | null): string {
  return (parseInt(String(value)) || 0).toLocaleString('en-US');
}

// ============================================
// BUILD FORM CONTEXT FROM DEAL DATA
// Maps our schema to form context values
// ============================================
function buildFormContext(deal: any, vehicle: any, dealer: any) {
  const nameParts = (deal.purchaser_name || '').trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';
  const today = formatDate(new Date().toISOString());

  return {
    // === DEALER ===
    'dealer.dealer_name': dealer?.dealer_name || dealer?.name || '',
    'dealer.dealer_license': dealer?.dealer_license || dealer?.license_number || '',
    'dealer.address': dealer?.address || '',
    'dealer.city': dealer?.city || '',
    'dealer.state': dealer?.state || '',
    'dealer.zip': dealer?.zip || '',
    'dealer.phone': dealer?.phone || '',
    'dealer.email': dealer?.email || '',
    // Aliases
    dealer_name: dealer?.dealer_name || dealer?.name || '',
    dealer_license: dealer?.dealer_license || '',
    dealer_address: dealer?.address || '',
    dealer_city: dealer?.city || '',
    dealer_state: dealer?.state || '',
    dealer_zip: dealer?.zip || '',
    dealer_phone: dealer?.phone || '',

    // === VEHICLE ===
    'vehicle.vin': vehicle?.vin || '',
    'vehicle.year': String(vehicle?.year || ''),
    'vehicle.make': vehicle?.make || '',
    'vehicle.model': vehicle?.model || '',
    'vehicle.trim': vehicle?.trim || '',
    'vehicle.color': vehicle?.color || '',
    'vehicle.mileage': formatNumber(vehicle?.miles || vehicle?.mileage || 0),
    'vehicle.stock_number': vehicle?.stock_number || '',
    // Aliases
    vin: vehicle?.vin || '',
    year: String(vehicle?.year || ''),
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    color: vehicle?.color || '',
    odometer: formatNumber(vehicle?.miles || vehicle?.mileage || 0),
    mileage: formatNumber(vehicle?.miles || vehicle?.mileage || 0),
    stock_number: vehicle?.stock_number || '',

    // === DEAL (BUYER + PRICING) ===
    'deal.purchaser_name': deal.purchaser_name || '',
    'deal.purchaser_address': deal.address || '',
    'deal.date_of_sale': formatDate(deal.date_of_sale),
    'deal.price': formatCurrency(deal.price || deal.sale_price || 0),
    'deal.down_payment': formatCurrency(deal.down_payment || 0),
    'deal.sales_tax': formatCurrency(deal.sales_tax || 0),
    'deal.total_price': formatCurrency(deal.total_price || deal.total_sale || 0),
    // Aliases
    purchaser_name: deal.purchaser_name || '',
    buyer_name: deal.purchaser_name || '',
    buyer_first_name: firstName,
    buyer_last_name: lastName,
    buyer_address: deal.address || '',
    buyer_city: deal.city || '',
    buyer_state: deal.state || '',
    buyer_zip: deal.zip || '',
    buyer_phone: deal.phone || '',
    buyer_email: deal.email || '',
    date_of_sale: formatDate(deal.date_of_sale),
    sale_date: formatDate(deal.date_of_sale),
    price: formatCurrency(deal.price || deal.sale_price || 0),
    sale_price: formatCurrency(deal.price || deal.sale_price || 0),
    down_payment: formatCurrency(deal.down_payment || 0),
    sales_tax: formatCurrency(deal.sales_tax || 0),
    total_price: formatCurrency(deal.total_price || deal.total_sale || 0),
    doc_fee: formatCurrency(deal.doc_fee || 0),
    balance_due: formatCurrency(deal.balance_due || 0),

    // === FINANCING ===
    'financing.loan_amount': formatCurrency(deal.amount_financed || 0),
    'financing.interest_rate': deal.interest_rate ? `${deal.interest_rate}%` : '',
    'financing.term_months': String(deal.term_months || ''),
    'financing.monthly_payment': formatCurrency(deal.monthly_payment || 0),
    'financing.apr': deal.apr ? `${deal.apr}%` : '',
    // Aliases
    amount_financed: formatCurrency(deal.amount_financed || 0),
    apr: deal.apr ? `${deal.apr}%` : '',
    interest_rate: deal.interest_rate ? `${deal.interest_rate}%` : '',
    term_months: String(deal.term_months || ''),
    monthly_payment: formatCurrency(deal.monthly_payment || 0),
    total_of_payments: formatCurrency(deal.total_of_payments || 0),
    finance_charge: formatCurrency((deal.total_of_payments || 0) - (deal.amount_financed || 0)),
    first_payment_date: formatDate(deal.first_payment_date),

    // === TRADE ===
    trade_description: deal.trade_description || '',
    trade_value: formatCurrency(deal.trade_value || 0),
    trade_payoff: formatCurrency(deal.trade_payoff || 0),
    trade_vin: deal.trade_vin || '',

    // === DATES ===
    today: today,
    current_date: today,
    signature_date: formatDate(deal.date_of_sale) || today,

    // === OTHER ===
    salesman: deal.salesman || '',
    deal_type: deal.deal_type || '',
    deal_number: String(deal.id || ''),
  };
}

// ============================================
// RESOLVE FIELD VALUE FROM CONTEXT
// ============================================
function resolveFieldValue(mapping: any, context: Record<string, any>): string {
  if (!mapping) return '';

  const field = mapping.universal_field;
  if (!field) return '';

  // Try exact match first
  if (context[field] !== undefined) {
    return String(context[field] || '');
  }

  // Try without category prefix
  const fieldName = field.split('.').pop();
  if (fieldName && context[fieldName] !== undefined) {
    return String(context[fieldName] || '');
  }

  return '';
}

// ============================================
// FILL PDF FORM FIELDS
// ============================================
async function fillPdfForm(
  pdfBytes: ArrayBuffer,
  fieldMappings: any[],
  context: Record<string, any>
): Promise<{ pdfBytes: Uint8Array; filledCount: number; totalFields: number }> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  let filledCount = 0;
  let totalFields = 0;

  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    totalFields = fields.length;

    console.log(`[FILL] PDF has ${totalFields} fillable fields`);

    // Build mapping lookup: pdf_field -> universal_field
    const mappingLookup = new Map<string, any>();
    for (const mapping of fieldMappings) {
      if (mapping.pdf_field && mapping.universal_field) {
        mappingLookup.set(mapping.pdf_field, mapping);
      }
    }

    // Fill each field
    for (const field of fields) {
      const fieldName = field.getName();
      const mapping = mappingLookup.get(fieldName);

      if (mapping) {
        const value = resolveFieldValue(mapping, context);
        if (value) {
          try {
            const textField = form.getTextField(fieldName);
            textField.setText(value);
            filledCount++;
            console.log(`[FILL] ${fieldName} = "${value.substring(0, 40)}"`);
          } catch {
            // Might be a checkbox or other type
            try {
              const checkbox = form.getCheckBox(fieldName);
              if (value === 'X' || value === 'true' || value === '1') {
                checkbox.check();
                filledCount++;
              }
            } catch {
              // Skip unsupported field types
            }
          }
        }
      }
    }

    form.flatten();
  } catch (err) {
    console.log(`[FILL] Error filling form: ${err}`);
  }

  return {
    pdfBytes: await pdfDoc.save(),
    filledCount,
    totalFields
  };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deal_id } = await req.json();
    if (!deal_id) throw new Error("deal_id is required");

    console.log(`[DOCS] Generating documents for deal: ${deal_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get deal
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('*')
      .eq('id', deal_id)
      .single();

    if (dealError || !deal) {
      throw new Error(`Deal not found: ${dealError?.message || deal_id}`);
    }

    console.log(`[DOCS] Deal: ${deal.deal_type} for ${deal.purchaser_name}`);

    // Get vehicle
    const { data: vehicle } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', deal.vehicle_id)
      .single();

    console.log(`[DOCS] Vehicle: ${vehicle?.year} ${vehicle?.make} ${vehicle?.model}`);

    // Get dealer
    const { data: dealer } = await supabase
      .from('dealer_settings')
      .select('*')
      .eq('id', deal.dealer_id)
      .single();

    console.log(`[DOCS] Dealer: ${dealer?.dealer_name || dealer?.name}`);

    // Build context for form filling
    const context = buildFormContext(deal, vehicle, dealer);
    console.log(`[DOCS] Context built with ${Object.keys(context).length} fields`);

    // Get document package for this deal type
    const { data: pkg } = await supabase
      .from('document_packages')
      .select('form_ids')
      .eq('dealer_id', deal.dealer_id)
      .eq('deal_type', deal.deal_type)
      .single();

    if (!pkg?.form_ids || pkg.form_ids.length === 0) {
      throw new Error(`No document package configured for ${deal.deal_type} deals. Configure packages in Document Rules.`);
    }

    console.log(`[DOCS] Package has ${pkg.form_ids.length} forms`);

    // Get forms from form_library
    const { data: forms, error: formsError } = await supabase
      .from('form_library')
      .select('id, form_number, form_name, download_url, source_url, field_mappings, is_fillable, storage_path, storage_bucket')
      .in('id', pkg.form_ids);

    if (formsError) {
      throw new Error(`Error loading forms: ${formsError.message}`);
    }

    // If no form_ids matched, fall back to docs text array for template matching
    if (!forms?.length) {
      console.log(`[DOCS] No form_library rows matched form_ids. Falling back to docs names.`);
      // Re-fetch package with docs column
      const { data: fullPkg } = await supabase
        .from('document_packages')
        .select('docs')
        .eq('dealer_id', deal.dealer_id)
        .eq('deal_type', deal.deal_type)
        .single();

      const docNames = fullPkg?.docs || [];
      if (docNames.length === 0) {
        throw new Error(`No document package configured for ${deal.deal_type} deals.`);
      }

      // Create pseudo-form objects from doc names for template matching
      const pseudoForms = docNames.map((name: string) => ({
        id: null,
        form_number: null,
        form_name: name,
        download_url: null,
        source_url: null,
        field_mappings: null,
        is_fillable: false,
        storage_path: null,
        storage_bucket: null
      }));

      console.log(`[DOCS] Using ${pseudoForms.length} doc names from package: ${docNames.join(', ')}`);
      // Replace forms with pseudo-forms
      (forms as any[]).push(...pseudoForms);
    }

    console.log(`[DOCS] Found ${forms.length} active forms to generate`);

    const generated: any[] = [];
    const errors: any[] = [];

    for (const form of forms) {
      try {
        console.log(`\n[DOCS] Processing: ${form.form_name} (${form.form_number || 'no number'})`);

        let pdfBytes: Uint8Array | undefined;
        let debugInfo: any = {};

        // Try to fill PDF if we have one with mappings
        const pdfUrl = form.download_url || form.source_url;
        const hasMappings = form.field_mappings && (Array.isArray(form.field_mappings) ? form.field_mappings.length > 0 : Object.keys(form.field_mappings).length > 0);

        if ((pdfUrl || form.storage_path) && form.is_fillable && hasMappings) {
          let templateBytes: ArrayBuffer | null = null;

          // Try Supabase storage first (form_library uploads)
          if (form.storage_path && form.storage_bucket) {
            console.log(`[DOCS] Downloading from storage: ${form.storage_bucket}/${form.storage_path}`);
            const { data: storageData, error: storageError } = await supabase.storage
              .from(form.storage_bucket)
              .download(form.storage_path);
            if (storageData && !storageError) {
              templateBytes = await storageData.arrayBuffer();
            } else {
              console.log(`[DOCS] Storage download failed: ${storageError?.message}`);
            }
          }

          // Fall back to external URL
          if (!templateBytes && pdfUrl) {
            console.log(`[DOCS] Filling PDF from URL: ${pdfUrl}`);
            const pdfResponse = await fetch(pdfUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (pdfResponse.ok) {
              templateBytes = await pdfResponse.arrayBuffer();
            } else {
              console.log(`[DOCS] Failed to download PDF: ${pdfResponse.status}`);
            }
          }

          if (templateBytes) {
            // Normalize field_mappings to array format
            const mappings = Array.isArray(form.field_mappings)
              ? form.field_mappings
              : Object.entries(form.field_mappings).map(([k, v]: [string, any]) => ({
                  pdf_field: k,
                  universal_field: typeof v === 'string' ? v : v?.universal_field || ''
                }));

            const fillResult = await fillPdfForm(templateBytes, mappings, context);
            pdfBytes = fillResult.pdfBytes;

            debugInfo = {
              generatedFrom: 'filled_pdf',
              source: form.storage_path ? 'storage' : pdfUrl,
              totalFields: fillResult.totalFields,
              filledCount: fillResult.filledCount
            };

            console.log(`[DOCS] Filled ${fillResult.filledCount}/${fillResult.totalFields} fields`);
          }
        }

        // Fall back to code templates if no PDF
        if (!pdfBytes) {
          const templateKey = form.form_name || form.form_number;
          const templateGenerator = TEMPLATES[templateKey] ||
                                    TEMPLATES[form.form_number] ||
                                    findTemplateByKeyword(templateKey);

          if (templateGenerator) {
            console.log(`[DOCS] Using code template for: ${templateKey}`);
            pdfBytes = await templateGenerator({ deal, vehicle, dealer, customer: null });
            debugInfo = { generatedFrom: 'code_template', templateKey };
          } else {
            throw new Error(`No PDF or template available for ${form.form_name}`);
          }
        }

        // Upload generated PDF
        const timestamp = Date.now();
        const safeFormNumber = (form.form_number || 'DOC').replace(/[^a-zA-Z0-9-]/g, '_');
        const fileName = `${safeFormNumber}_${String(deal_id).slice(0, 8)}_${timestamp}.pdf`;
        const storagePath = `dealers/${deal.dealer_id}/deals/${deal_id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('deal-documents')
          .upload(storagePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // Get signed URL
        const { data: urlData } = await supabase.storage
          .from('deal-documents')
          .createSignedUrl(storagePath, 86400);

        // Record in generated_documents
        await supabase.from('generated_documents').insert({
          deal_id: typeof deal_id === 'string' ? parseInt(deal_id) : deal_id,
          dealer_id: deal.dealer_id,
          form_library_id: form.id || null,
          form_number: form.form_number || 'DOC',
          form_name: form.form_name,
          state: dealer?.state || 'UT',
          storage_path: storagePath,
          public_url: urlData?.signedUrl || null,
          generated_by: 'system',
          generation_method: debugInfo.generatedFrom || 'code_template'
        });

        generated.push({
          form_number: form.form_number,
          form_name: form.form_name,
          file_name: fileName,
          storage_path: storagePath,
          public_url: urlData?.signedUrl || null,
          debug: debugInfo
        });

        console.log(`[DOCS] Generated: ${form.form_name}`);

      } catch (err) {
        console.error(`[DOCS] Failed: ${form.form_name}:`, err);
        errors.push({
          form_number: form.form_number,
          form_name: form.form_name,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Update deal
    await supabase.from('deals')
      .update({
        docs_generated: generated.map(g => g.form_number),
        docs_generated_at: new Date().toISOString()
      })
      .eq('id', deal_id);

    console.log(`[DOCS] Complete: ${generated.length} generated, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        count: generated.length,
        documents: generated,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[DOCS] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================
// FIND TEMPLATE BY KEYWORD
// ============================================
function findTemplateByKeyword(formName: string): ((data: any) => Promise<Uint8Array>) | null {
  const lower = (formName || '').toLowerCase();

  if (lower.includes('contract of sale') || lower.includes('motor vehicle contract')) {
    return TEMPLATES['MVCS'];
  }
  if (lower.includes('odometer') || lower.includes('mileage disclosure')) {
    return TEMPLATES['Odometer Disclosure'];
  }
  if (lower.includes('bill of sale')) {
    return TEMPLATES['Bill of Sale'];
  }
  if (lower.includes('buyers guide') || lower.includes("buyer's guide") || lower.includes('as-is')) {
    return TEMPLATES['Buyers Guide'];
  }

  return null;
}
