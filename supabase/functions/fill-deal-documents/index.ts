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
// GET NESTED VALUE FROM OBJECT
// ============================================
function getNestedValue(obj: any, path: string): any {
  if (!path) return null;
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value === undefined || value === null) return null;
    value = value[part];
  }
  return value;
}

// ============================================
// BUILD FORM CONTEXT - Flat object with all values
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
    dealer_license: dealer?.dealer_license || '',

    // Buyer (multiple aliases for different forms)
    buyer_name: deal.purchaser_name || customer?.name || '',
    buyer_address: customer?.address || '',
    buyer_city: customer?.city || '',
    buyer_state: customer?.state || '',
    buyer_zip: customer?.zip || '',
    buyer_phone: deal.customer_phone || customer?.phone || '',
    buyer_email: deal.customer_email || customer?.email || '',
    buyer_dl_number: customer?.dl_number || '',
    buyer_dl_state: customer?.dl_state || '',
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
    trim: vehicle?.trim || '',
    vin: (vehicle?.vin || '').toUpperCase(),
    body_type: vehicle?.body_type || 'SEDAN',
    body_style: vehicle?.body_style || vehicle?.body_type || '',
    color: (vehicle?.color || '').toUpperCase(),
    stock_number: vehicle?.stock_number || '',
    odometer: formatNumber(vehicle?.miles || vehicle?.mileage || 0),
    mileage: formatNumber(vehicle?.miles || vehicle?.mileage || 0),
    miles: formatNumber(vehicle?.miles || vehicle?.mileage || 0),

    // Sale
    sale_date: formatDate(deal.date_of_sale),
    date_of_sale: formatDate(deal.date_of_sale),
    purchase_date: formatDate(deal.date_of_sale),
    sale_price: formatCurrency(salePrice),
    purchase_price: formatCurrency(salePrice),
    price: formatCurrency(salePrice),
    trade_allowance: formatCurrency(tradeValue),
    trade_value: formatCurrency(tradeValue),
    trade_payoff: formatCurrency(parseFloat(deal.trade_payoff) || 0),
    sales_tax: formatCurrency(salesTax),
    tax_amount: formatCurrency(salesTax),
    doc_fee: formatCurrency(parseFloat(deal.doc_fee) || 299),
    title_fee: formatCurrency(parseFloat(deal.title_fee) || 0),
    registration_fee: formatCurrency(parseFloat(deal.registration_fee) || 0),
    total_due: formatCurrency(salePrice + salesTax + (parseFloat(deal.doc_fee) || 299) - tradeValue),
    down_payment: formatCurrency(parseFloat(deal.down_payment) || 0),

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
      final_payment_date: '', // Would need to calculate
    } : {}),

    // Lienholder (BHPH = dealer)
    lienholder_name: deal.deal_type === 'BHPH' ? (dealer?.dealer_name || dealer?.name || '') : '',
    lienholder_address: deal.deal_type === 'BHPH' ? (dealer?.address || '') : '',

    // Salesman
    salesman: deal.salesman || '',
    salesperson: deal.salesman || '',

    // Signatures (placeholders)
    buyer_signature: '',
    seller_signature: '',
    signature_date: formatDate(deal.date_of_sale),
    co_buyer_signature: '',
  };
}

// ============================================
// FILL HTML TEMPLATE WITH DATA
// ============================================
function fillHtmlTemplate(
  html: string,
  fieldMapping: Record<string, string>,
  rawData: { deal: any, vehicle: any, dealer: any, customer: any },
  context: Record<string, any>
): string {
  let filled = html;

  // Replace {{field_name}} placeholders using field mapping
  for (const [fieldName, dbColumn] of Object.entries(fieldMapping || {})) {
    if (!dbColumn) continue;

    // Get value from raw data using dotted path
    let value = getNestedValue(rawData, dbColumn);

    // If not found, try the flat context
    if (value === undefined || value === null) {
      const flatKey = dbColumn.split('.').pop() || dbColumn;
      value = context[flatKey];
    }

    // Format the value
    const strValue = value !== undefined && value !== null ? String(value) : '';

    // Replace {{fieldName}} style placeholders
    filled = filled.replace(new RegExp(`\\{\\{\\s*${fieldName}\\s*\\}\\}`, 'gi'), strValue);

    // Replace content inside elements with data-field attribute
    // Matches: data-field="fieldName">...</ or data-field="fieldName" ...>
    const dataFieldRegex = new RegExp(
      `(data-field=["']${fieldName}["'][^>]*>)([^<]*)(<)`,
      'gi'
    );
    filled = filled.replace(dataFieldRegex, `$1${strValue}$3`);
  }

  // Also replace any remaining {{context_key}} placeholders directly from context
  for (const [key, value] of Object.entries(context)) {
    const strValue = value !== undefined && value !== null ? String(value) : '';
    filled = filled.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), strValue);
  }

  return filled;
}

// ============================================
// CONVERT HTML TO PDF USING EXTERNAL API
// ============================================
async function htmlToPdfExternal(html: string): Promise<Uint8Array | null> {
  // Try PDFShift API if key is available
  const pdfshiftKey = Deno.env.get("PDFSHIFT_API_KEY");
  if (pdfshiftKey) {
    try {
      console.log("Converting HTML to PDF via PDFShift...");
      const response = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`api:${pdfshiftKey}`)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source: html,
          landscape: false,
          use_print: true,
          format: "Letter"
        })
      });

      if (response.ok) {
        const pdfBuffer = await response.arrayBuffer();
        console.log(`PDFShift returned ${pdfBuffer.byteLength} bytes`);
        return new Uint8Array(pdfBuffer);
      } else {
        console.error("PDFShift error:", await response.text());
      }
    } catch (err) {
      console.error("PDFShift failed:", err);
    }
  }

  // Try html2pdf.app API if available
  const html2pdfKey = Deno.env.get("HTML2PDF_API_KEY");
  if (html2pdfKey) {
    try {
      console.log("Converting HTML to PDF via html2pdf.app...");
      const response = await fetch("https://api.html2pdf.app/v1/generate", {
        method: "POST",
        headers: {
          "Authorization": html2pdfKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          html: html,
          format: "Letter",
          marginTop: 10,
          marginBottom: 10,
          marginLeft: 10,
          marginRight: 10
        })
      });

      if (response.ok) {
        const pdfBuffer = await response.arrayBuffer();
        console.log(`html2pdf.app returned ${pdfBuffer.byteLength} bytes`);
        return new Uint8Array(pdfBuffer);
      } else {
        console.error("html2pdf.app error:", await response.text());
      }
    } catch (err) {
      console.error("html2pdf.app failed:", err);
    }
  }

  return null;
}

// ============================================
// CONVERT HTML TO PDF USING PDF-LIB (Fallback)
// Creates a simple text-based PDF from HTML
// ============================================
async function htmlToPdfFallback(html: string, formName: string): Promise<Uint8Array> {
  console.log("Using pdf-lib fallback for HTML to PDF conversion");

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Extract text content from HTML (basic parsing)
  const textContent = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, '\n') // Replace tags with newlines
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .trim();

  const lines = textContent.split('\n').filter(line => line.trim());

  let page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  let y = height - 50;
  const lineHeight = 14;
  const margin = 50;
  const maxWidth = width - (margin * 2);

  // Title
  page.drawText(formName || 'Document', {
    x: margin,
    y,
    size: 16,
    font: boldFont,
    color: rgb(0, 0, 0)
  });
  y -= 30;

  // Add horizontal line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7)
  });
  y -= 20;

  // Content
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Word wrap
    const words = trimmedLine.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = font.widthOfTextAtSize(testLine, 10);

      if (textWidth > maxWidth) {
        if (currentLine) {
          if (y < 50) {
            page = pdfDoc.addPage([612, 792]);
            y = height - 50;
          }
          page.drawText(currentLine, {
            x: margin,
            y,
            size: 10,
            font,
            color: rgb(0, 0, 0)
          });
          y -= lineHeight;
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      if (y < 50) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 50;
      }
      page.drawText(currentLine, {
        x: margin,
        y,
        size: 10,
        font,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight;
    }
  }

  // Footer
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`Generated by OG Dealer - Page ${i + 1} of ${pages.length}`, {
      x: margin,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });
  }

  return await pdfDoc.save();
}

// ============================================
// RESOLVE DOTTED PATH (e.g., "vehicle.vin" -> value)
// ============================================
function resolvePath(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value === undefined || value === null) return null;
    value = value[part];
  }
  return value;
}

// ============================================
// FILL PDF FORM (for fillable PDFs)
// ============================================
interface FillResult {
  pdfBytes: Uint8Array;
  debug: {
    pdfFieldCount: number;
    pdfFieldNames: string[];
    mappingCount: number;
    filledCount: number;
    filledFields: string[];
  };
}

async function fillPdfForm(
  pdfBytes: ArrayBuffer,
  fieldMapping: Record<string, string>,
  context: Record<string, any>,
  rawData: { deal: any, vehicle: any, dealer: any, customer: any }
): Promise<FillResult> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const debug = {
    pdfFieldCount: 0,
    pdfFieldNames: [] as string[],
    mappingCount: Object.keys(fieldMapping || {}).length,
    filledCount: 0,
    filledFields: [] as string[]
  };

  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    debug.pdfFieldCount = fields.length;
    debug.pdfFieldNames = fields.map(f => f.getName());

    console.log(`PDF has ${fields.length} fillable fields:`, debug.pdfFieldNames.slice(0, 10));

    for (const [pdfFieldName, sourcePath] of Object.entries(fieldMapping || {})) {
      try {
        let value = resolvePath(rawData, sourcePath);

        if (value === undefined || value === null) {
          const flatKey = sourcePath.split('.').pop() || sourcePath;
          value = context[flatKey];
        }

        if (value === undefined || value === null || value === '') continue;

        try {
          const field = form.getTextField(pdfFieldName);
          field.setText(String(value));
          debug.filledCount++;
          debug.filledFields.push(`${pdfFieldName}=${value}`);
        } catch {
          try {
            const checkbox = form.getCheckBox(pdfFieldName);
            if (value === 'X' || value === true || value === 'true') {
              checkbox.check();
              debug.filledCount++;
              debug.filledFields.push(`${pdfFieldName}=checked`);
            }
          } catch {
            // Field not found
          }
        }
      } catch (err) {
        console.warn(`Could not fill ${pdfFieldName}:`, err);
      }
    }

    form.flatten();
  } catch (err) {
    console.warn('PDF may not have fillable fields:', err);
    debug.pdfFieldCount = 0;
  }

  return {
    pdfBytes: await pdfDoc.save(),
    debug
  };
}

// ============================================
// FIND TEMPLATE BY KEYWORD
// ============================================
function findTemplateByKeyword(formName: string): ((data: any) => Promise<Uint8Array>) | null {
  const lower = (formName || '').toLowerCase();

  if (lower.includes('mvcs') || lower.includes('contract of sale') || lower.includes('motor vehicle contract')) {
    return TEMPLATES['MVCS'];
  }
  if (lower.includes('odometer') || lower.includes('mileage disclosure')) {
    return TEMPLATES['Odometer Disclosure'];
  }
  if (lower.includes('bill of sale') || lower.includes('tc-861')) {
    return TEMPLATES['Bill of Sale'];
  }
  if (lower.includes('buyers guide') || lower.includes("buyer's guide") || lower.includes('as-is') || lower.includes('warranty disclosure')) {
    return TEMPLATES['Buyers Guide'];
  }

  return null;
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
    const rawData = { deal, vehicle, dealer, customer };
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

    // Get forms from form_staging - NOW INCLUDING html_template_url and template_status
    const { data: forms, error: formsError } = await supabase
      .from('form_staging')
      .select('id, form_number, form_name, storage_path, storage_bucket, source_url, field_mapping, html_template_url, template_status')
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

        let pdfBytes: Uint8Array;
        let debugInfo: any = {};

        // ============================================
        // PRIORITY 1: Check for HTML template
        // ============================================
        if (form.html_template_url && form.template_status === 'ready') {
          console.log(`Using HTML template: ${form.html_template_url}`);

          // Fetch HTML template from storage
          const { data: htmlData, error: htmlError } = await supabase.storage
            .from('form-templates')
            .download(form.html_template_url);

          if (htmlData && !htmlError) {
            const htmlTemplate = await htmlData.text();
            console.log(`HTML template loaded: ${htmlTemplate.length} chars`);

            // Fill the HTML template with data
            const filledHtml = fillHtmlTemplate(htmlTemplate, form.field_mapping || {}, rawData, context);
            console.log(`HTML filled with data`);

            // Try external PDF conversion first
            const externalPdf = await htmlToPdfExternal(filledHtml);

            if (externalPdf) {
              pdfBytes = externalPdf;
              debugInfo = {
                generatedFrom: 'html_template',
                htmlTemplateUrl: form.html_template_url,
                pdfConverter: 'external_api'
              };
            } else {
              // Fallback to pdf-lib based conversion
              pdfBytes = await htmlToPdfFallback(filledHtml, form.form_name);
              debugInfo = {
                generatedFrom: 'html_template',
                htmlTemplateUrl: form.html_template_url,
                pdfConverter: 'pdf-lib_fallback'
              };
            }

            console.log(`PDF generated from HTML: ${pdfBytes.length} bytes`);
          } else {
            console.log(`Failed to load HTML template: ${htmlError?.message}`);
            // Fall through to other methods
          }
        }

        // ============================================
        // PRIORITY 2: Try PDF template
        // ============================================
        if (!pdfBytes!) {
          let templateBytes: ArrayBuffer | null = null;

          // Try form-templates bucket
          if (form.storage_path) {
            console.log(`Trying form-templates/${form.storage_path}`);
            const { data: templateData, error: downloadError } = await supabase.storage
              .from('form-templates')
              .download(form.storage_path);

            if (templateData && !downloadError) {
              templateBytes = await templateData.arrayBuffer();
              console.log(`Downloaded from form-templates: ${templateBytes.byteLength} bytes`);
            }
          }

          // Try form-pdfs bucket
          if (!templateBytes && form.source_url?.includes('supabase.co/storage')) {
            const match = form.source_url.match(/\/form-pdfs\/(.+)$/);
            if (match) {
              const pdfPath = match[1];
              const { data: pdfData, error: pdfError } = await supabase.storage
                .from('form-pdfs')
                .download(pdfPath);

              if (pdfData && !pdfError) {
                templateBytes = await pdfData.arrayBuffer();
              }
            }
          }

          // Try external URL
          if (!templateBytes && form.source_url && form.source_url.endsWith('.pdf')) {
            try {
              const response = await fetch(form.source_url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
              });
              if (response.ok) {
                templateBytes = await response.arrayBuffer();
              }
            } catch {}
          }

          if (templateBytes) {
            // Fill the PDF form
            const fillResult = await fillPdfForm(templateBytes, form.field_mapping || {}, context, rawData);

            // If PDF has fillable fields, use it
            if (fillResult.debug.pdfFieldCount > 0) {
              pdfBytes = fillResult.pdfBytes;
              debugInfo = fillResult.debug;
            }
          }
        }

        // ============================================
        // PRIORITY 3: Use code-generated template
        // ============================================
        if (!pdfBytes!) {
          const templateKey = form.form_name || form.form_number;
          const templateGenerator = TEMPLATES[templateKey] ||
                                     TEMPLATES[form.form_number] ||
                                     findTemplateByKeyword(templateKey);

          if (templateGenerator) {
            console.log(`Using code generator for: ${templateKey}`);
            pdfBytes = await templateGenerator({ deal, vehicle, dealer, customer });
            debugInfo = { generatedFrom: 'code_template', templateKey };
          } else {
            throw new Error(`No template available for ${form.form_number}`);
          }
        }

        // Generate filename and path
        const timestamp = Date.now();
        const safeFormNumber = (form.form_number || 'DOC').replace(/[^a-zA-Z0-9-]/g, '_');
        const dealIdStr = String(deal_id);
        const fileName = `${safeFormNumber}_${dealIdStr.slice(0, 8)}_${timestamp}.pdf`;
        const storagePath = `dealers/${deal.dealer_id}/deals/${deal_id}/${fileName}`;

        // Upload to deal-documents bucket
        const { error: uploadError } = await supabase.storage
          .from('deal-documents')
          .upload(storagePath, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        console.log(`Uploaded to: ${storagePath}`);

        // Get signed URL
        const { data: urlData } = await supabase.storage
          .from('deal-documents')
          .createSignedUrl(storagePath, 86400);

        // Record in generated_documents
        const insertData = {
          deal_id: typeof deal_id === 'string' ? parseInt(deal_id) : deal_id,
          dealer_id: deal.dealer_id,
          form_number: form.form_number,
          form_name: form.form_name,
          state: dealer?.state || 'UT',
          storage_path: storagePath,
          public_url: urlData?.signedUrl || null,
          generated_by: 'system'
        };

        const { error: insertError } = await supabase.from('generated_documents').insert(insertData);

        if (insertError) {
          console.error(`DB insert failed: ${insertError.message}`);
          errors.push({
            form_number: form.form_number,
            form_name: form.form_name,
            error: `PDF created but DB insert failed: ${insertError.message}`
          });
        }

        generated.push({
          form_number: form.form_number,
          form_name: form.form_name,
          file_name: fileName,
          storage_path: storagePath,
          public_url: urlData?.signedUrl || null,
          debug: debugInfo
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
