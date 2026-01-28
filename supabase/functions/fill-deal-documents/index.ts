import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number | string | null): string {
  return (parseInt(String(value)) || 0).toLocaleString('en-US');
}

// ============================================
// FINANCING CALCULATOR
// ============================================
function calculateFinancing(deal: any) {
  const price = parseFloat(deal.price) || 0;
  const downPayment = parseFloat(deal.down_payment) || 0;
  const tradeValue = parseFloat(deal.trade_value) || 0;
  const tradePayoff = parseFloat(deal.trade_payoff) || 0;
  const docFee = parseFloat(deal.doc_fee) || 299;
  const termMonths = parseInt(deal.term_months) || 48;
  const interestRate = parseFloat(deal.interest_rate) || 18;

  const gap = deal.gap_insurance ? 595 : 0;
  const warranty = deal.extended_warranty ? 1495 : 0;
  const protection = deal.protection_package ? 895 : 0;
  const accessories = (parseFloat(deal.accessory_1_price) || 0) +
                      (parseFloat(deal.accessory_2_price) || 0) +
                      (parseFloat(deal.accessory_3_price) || 0);

  const negativeEquity = Math.max(0, tradePayoff - tradeValue);
  const totalSale = price + docFee + gap + warranty + protection + accessories - tradeValue + negativeEquity;
  const amountFinanced = totalSale - downPayment;

  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment = amountFinanced > 0 && monthlyRate > 0
    ? (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1)
    : amountFinanced / termMonths;

  const totalOfPayments = monthlyPayment * termMonths;
  const financeCharge = totalOfPayments - amountFinanced;

  const firstPaymentDate = new Date();
  firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
  firstPaymentDate.setDate(15);

  return {
    amountFinanced,
    termMonths,
    interestRate,
    apr: interestRate,
    monthlyPayment,
    totalOfPayments,
    financeCharge,
    downPayment,
    firstPaymentDate: firstPaymentDate.toISOString().split('T')[0]
  };
}

// ============================================
// BUILD FORM CONTEXT
// ============================================
function buildFormContext(deal: any, vehicle: any, dealer: any, customer: any) {
  const financing = (deal.deal_type === 'BHPH' || deal.deal_type === 'Financing') ? calculateFinancing(deal) : null;

  const salesTaxRate = 0.0685;
  const salePrice = parseFloat(deal.price) || 0;
  const tradeValue = parseFloat(deal.trade_value) || 0;
  const salesTax = Math.max(0, (salePrice - tradeValue) * salesTaxRate);

  return {
    // Dealer
    dealer_name: dealer?.dealer_name || dealer?.name || '',
    dealer_number: dealer?.dealer_license || dealer?.license_number || '',
    dealer_address: dealer?.address || '',
    dealer_city: dealer?.city || '',
    dealer_state: dealer?.state || 'UT',
    dealer_zip: dealer?.zip || '',
    dealer_phone: dealer?.phone || '',

    // Buyer (multiple aliases for different forms)
    buyer_name: deal.purchaser_name || customer?.name || '',
    buyer_address: customer?.address || '',
    buyer_phone: deal.customer_phone || customer?.phone || '',
    buyer_email: deal.customer_email || customer?.email || '',
    owner_name: deal.purchaser_name || customer?.name || '',
    borrower_name: deal.purchaser_name || customer?.name || '',
    debtor_name: deal.purchaser_name || customer?.name || '',
    purchaser_name: deal.purchaser_name || customer?.name || '',

    // Seller = Dealer
    seller_name: dealer?.dealer_name || dealer?.name || '',
    seller_address: dealer?.address || '',
    lender_name: dealer?.dealer_name || dealer?.name || '',
    creditor_name: dealer?.dealer_name || dealer?.name || '',

    // Vehicle
    vehicle_year: vehicle?.year?.toString() || '',
    year: vehicle?.year?.toString() || '',
    vehicle_make: (vehicle?.make || '').toUpperCase(),
    make: (vehicle?.make || '').toUpperCase(),
    vehicle_model: (vehicle?.model || '').toUpperCase(),
    model: (vehicle?.model || '').toUpperCase(),
    vin: (vehicle?.vin || '').toUpperCase(),
    body_type: vehicle?.body_type || 'SEDAN',
    color: (vehicle?.color || '').toUpperCase(),
    stock_number: vehicle?.stock_number || '',
    odometer: formatNumber(vehicle?.miles || vehicle?.mileage || 0),
    mileage: formatNumber(vehicle?.miles || vehicle?.mileage || 0),

    // Sale
    sale_date: formatDate(deal.date_of_sale),
    date_of_sale: formatDate(deal.date_of_sale),
    purchase_date: formatDate(deal.date_of_sale),
    sale_price: formatCurrency(salePrice),
    purchase_price: formatCurrency(salePrice),
    price: formatCurrency(salePrice),
    trade_allowance: formatCurrency(tradeValue),
    trade_value: formatCurrency(tradeValue),
    sales_tax: formatCurrency(salesTax),
    doc_fee: formatCurrency(parseFloat(deal.doc_fee) || 299),

    // Financing (BHPH/Financing)
    ...(financing ? {
      principal: formatCurrency(financing.amountFinanced),
      amount_financed: formatCurrency(financing.amountFinanced),
      apr: financing.apr.toFixed(2) + '%',
      interest_rate: financing.interestRate.toFixed(2) + '%',
      finance_charge: formatCurrency(financing.financeCharge),
      total_payments: formatCurrency(financing.totalOfPayments),
      total_of_payments: formatCurrency(financing.totalOfPayments),
      monthly_payment: formatCurrency(financing.monthlyPayment),
      payment_amount: formatCurrency(financing.monthlyPayment),
      term_months: financing.termMonths.toString(),
      number_of_payments: financing.termMonths.toString(),
      first_payment_date: formatDate(financing.firstPaymentDate),
      down_payment: formatCurrency(financing.downPayment)
    } : {}),

    // Lienholder (BHPH = dealer)
    lienholder_name: deal.deal_type === 'BHPH' ? (dealer?.dealer_name || dealer?.name || '') : '',
    lienholder_address: deal.deal_type === 'BHPH' ? (dealer?.address || '') : '',

    // Salesman
    salesman: deal.salesman || '',
    salesperson: deal.salesman || ''
  };
}

// ============================================
// FILL PDF FORM
// ============================================
async function fillPdfForm(pdfBytes: ArrayBuffer, fieldMapping: Record<string, string>, context: Record<string, any>): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    console.log(`PDF has ${fields.length} fields`);

    // First, try to fill using the field mapping
    for (const [contextKey, pdfFieldName] of Object.entries(fieldMapping || {})) {
      try {
        const value = context[contextKey];
        if (value === undefined || value === null || value === '') continue;

        try {
          const field = form.getTextField(pdfFieldName);
          field.setText(value.toString());
          console.log(`Filled ${pdfFieldName} with ${contextKey}`);
        } catch {
          try {
            const checkbox = form.getCheckBox(pdfFieldName);
            if (value === 'X' || value === true || value === 'true') {
              checkbox.check();
              console.log(`Checked ${pdfFieldName}`);
            }
          } catch {
            // Field not found in PDF
          }
        }
      } catch (err) {
        console.warn(`Could not fill ${pdfFieldName}:`, err);
      }
    }

    // Also try to auto-fill any unmapped fields by matching field names to context keys
    for (const field of fields) {
      const fieldName = field.getName();
      const normalizedFieldName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');

      // Check if this field was already filled by the mapping
      const wasMapped = Object.values(fieldMapping || {}).includes(fieldName);
      if (wasMapped) continue;

      // Try to find a matching context key
      for (const [contextKey, value] of Object.entries(context)) {
        const normalizedContextKey = contextKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (normalizedFieldName === normalizedContextKey ||
            normalizedFieldName.includes(normalizedContextKey) ||
            normalizedContextKey.includes(normalizedFieldName)) {
          try {
            if (value === undefined || value === null || value === '') continue;
            const textField = form.getTextField(fieldName);
            textField.setText(value.toString());
            console.log(`Auto-filled ${fieldName} with ${contextKey}`);
            break;
          } catch {
            // Not a text field or already filled
          }
        }
      }
    }

    form.flatten();
  } catch (err) {
    console.warn('PDF may not have fillable fields:', err);
  }

  return await pdfDoc.save();
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

    if (!deal_id) {
      throw new Error("deal_id is required");
    }

    console.log(`Generating documents for deal: ${deal_id}`);

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
      throw new Error(`Deal not found: ${dealError?.message || 'Unknown error'}`);
    }

    console.log(`Deal found: ${deal.deal_type} for ${deal.purchaser_name}`);

    // Get vehicle
    const { data: vehicle } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', deal.vehicle_id)
      .single();

    console.log(`Vehicle: ${vehicle?.year} ${vehicle?.make} ${vehicle?.model}`);

    // Get dealer
    const { data: dealer } = await supabase
      .from('dealer_settings')
      .select('*')
      .eq('id', deal.dealer_id)
      .single();

    console.log(`Dealer: ${dealer?.dealer_name || dealer?.name}`);

    // Get customer
    let customer = null;
    if (deal.customer_id) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('id', deal.customer_id)
        .single();
      customer = data;
    }

    // Build context
    const context = buildFormContext(deal, vehicle, dealer, customer);
    console.log('Context built with keys:', Object.keys(context).length);

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

    console.log(`Package has ${pkg.form_ids.length} forms`);

    // Get forms from form_staging
    const { data: forms, error: formsError } = await supabase
      .from('form_staging')
      .select('id, form_number, form_name, storage_path, storage_bucket, source_url, field_mapping')
      .in('id', pkg.form_ids)
      .eq('status', 'approved');

    if (formsError || !forms?.length) {
      throw new Error(`No approved forms found for this package: ${formsError?.message || 'Empty'}`);
    }

    console.log(`Found ${forms.length} approved forms to generate`);

    const generated: any[] = [];
    const errors: any[] = [];

    for (const form of forms) {
      try {
        console.log(`Processing: ${form.form_name} (${form.form_number})`);

        let templateBytes: ArrayBuffer | null = null;

        // Try 1: Download from form-templates bucket if storage_path is set
        if (form.storage_path) {
          console.log(`Trying form-templates/${form.storage_path}`);
          const { data: templateData, error: downloadError } = await supabase.storage
            .from('form-templates')
            .download(form.storage_path);

          if (templateData && !downloadError) {
            templateBytes = await templateData.arrayBuffer();
            console.log(`Downloaded from form-templates: ${templateBytes.byteLength} bytes`);
          } else {
            console.log(`Not found in form-templates: ${downloadError?.message}`);
          }
        }

        // Try 2: If source_url points to our storage, try form-pdfs bucket
        if (!templateBytes && form.source_url?.includes('supabase.co/storage')) {
          // Extract filename from source_url
          const match = form.source_url.match(/\/form-pdfs\/(.+)$/);
          if (match) {
            const pdfPath = match[1];
            console.log(`Trying form-pdfs/${pdfPath}`);
            const { data: pdfData, error: pdfError } = await supabase.storage
              .from('form-pdfs')
              .download(pdfPath);

            if (pdfData && !pdfError) {
              templateBytes = await pdfData.arrayBuffer();
              console.log(`Downloaded from form-pdfs: ${templateBytes.byteLength} bytes`);
            } else {
              console.log(`Not found in form-pdfs: ${pdfError?.message}`);
            }
          }
        }

        // Try 3: Download from external source_url
        if (!templateBytes && form.source_url && form.source_url.endsWith('.pdf')) {
          console.log(`Trying external URL: ${form.source_url}`);
          try {
            const response = await fetch(form.source_url, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (response.ok) {
              templateBytes = await response.arrayBuffer();
              console.log(`Downloaded from URL: ${templateBytes.byteLength} bytes`);
            } else {
              console.log(`URL download failed: ${response.status}`);
            }
          } catch (urlErr) {
            console.log(`URL download error: ${urlErr}`);
          }
        }

        if (!templateBytes) {
          throw new Error(`No PDF template available for ${form.form_number}. Upload PDF or set valid source_url.`);
        }
        console.log(`Template downloaded: ${templateBytes.byteLength} bytes`);

        // Fill the form
        const filledPdfBytes = await fillPdfForm(templateBytes, form.field_mapping || {}, context);
        console.log(`PDF filled: ${filledPdfBytes.length} bytes`);

        // Generate filename and path
        const timestamp = Date.now();
        const safeFormNumber = (form.form_number || 'DOC').replace(/[^a-zA-Z0-9-]/g, '_');
        const fileName = `${safeFormNumber}_${deal_id.slice(0, 8)}_${timestamp}.pdf`;
        const storagePath = `dealers/${deal.dealer_id}/deals/${deal_id}/${fileName}`;

        // Upload to deal-documents bucket
        const { error: uploadError } = await supabase.storage
          .from('deal-documents')
          .upload(storagePath, filledPdfBytes, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        console.log(`Uploaded to: ${storagePath}`);

        // Get public URL
        const { data: urlData } = await supabase.storage
          .from('deal-documents')
          .createSignedUrl(storagePath, 86400); // 24 hour URL

        // Record in generated_documents
        const { error: insertError } = await supabase.from('generated_documents').insert({
          deal_id: deal_id,
          form_registry_id: form.id,
          form_number: form.form_number,
          form_name: form.form_name,
          storage_path: storagePath,
          file_name: fileName,
          public_url: urlData?.signedUrl || null,
          generated_by: 'system',
          generated_at: new Date().toISOString()
        });

        if (insertError) {
          console.warn(`Failed to record document: ${insertError.message}`);
        }

        generated.push({
          form_number: form.form_number,
          form_name: form.form_name,
          file_name: fileName,
          storage_path: storagePath,
          public_url: urlData?.signedUrl || null
        });

        console.log(`Generated: ${form.form_name}`);

      } catch (err) {
        console.error(`Failed to generate ${form.form_number}:`, err);
        errors.push({
          form_number: form.form_number,
          form_name: form.form_name,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Update deal with generated docs info
    await supabase.from('deals')
      .update({
        docs_generated: generated.map(g => g.form_number),
        docs_generated_at: new Date().toISOString()
      })
      .eq('id', deal_id);

    console.log(`Complete: ${generated.length} generated, ${errors.length} errors`);

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
    console.error('Document generation error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
