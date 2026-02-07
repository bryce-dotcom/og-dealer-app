// ============================================
// DOCUMENT SERVICE - Uses EXISTING Schema
// form_registry, document_packages, dealer_forms
// ============================================

import { PDFDocument } from 'pdf-lib';
import { supabase } from './supabase';

// ============================================
// GET FORMS FOR A DEAL TYPE
// Uses existing document_packages + form_registry
// ============================================
export async function getDealForms(dealerId, dealType) {
  // First get the doc names from document_packages
  const { data: pkg, error: pkgError } = await supabase
    .from('document_packages')
    .select('docs')
    .eq('dealer_id', dealerId)
    .eq('deal_type', dealType)
    .single();

  if (pkgError || !pkg?.docs?.length) {
    console.warn('No document package found for', dealType);
    return [];
  }

  // Then get form details from form_registry
  const { data: forms, error: formError } = await supabase
    .from('form_registry')
    .select('id, form_number, form_name, storage_path, field_mappings')
    .or(`form_name.in.(${pkg.docs.map(d => `"${d}"`).join(',')}),form_number.in.(${pkg.docs.map(d => `"${d}"`).join(',')})`)
    .not('storage_path', 'is', null)
    .order('form_name');

  if (formError) {
    console.error('Error fetching forms:', formError);
    return [];
  }

  return forms || [];
}

// ============================================
// BUILD FORM CONTEXT FROM DEAL DATA
// ============================================
export function buildFormContext(deal, vehicle, dealer, customer) {
  const financing = deal.deal_type === 'BHPH' ? calculateFinancing(deal) : null;
  
  const salesTaxRate = 0.0685;
  const salePrice = parseFloat(deal.price) || 0;
  const tradeValue = parseFloat(deal.trade_value) || 0;
  const salesTax = Math.max(0, (salePrice - tradeValue) * salesTaxRate);

  return {
    // Dealer
    dealer_name: dealer?.dealer_name || '',
    dealer_number: dealer?.dealer_license || '',
    dealer_address: dealer?.address || '',
    dealer_city: dealer?.city || '',
    dealer_state: dealer?.state || 'UT',
    dealer_zip: dealer?.zip || '',
    dealer_phone: dealer?.phone || '',

    // Buyer (multiple aliases for different forms)
    buyer_name: deal.purchaser_name || customer?.name || '',
    buyer_address: customer?.address || '',
    owner_name: deal.purchaser_name || customer?.name || '',
    borrower_name: deal.purchaser_name || customer?.name || '',
    debtor_name: deal.purchaser_name || customer?.name || '',

    // Seller = Dealer
    seller_name: dealer?.dealer_name || '',
    seller_address: dealer?.address || '',
    lender_name: dealer?.dealer_name || '',
    creditor_name: dealer?.dealer_name || '',

    // Vehicle
    vehicle_year: vehicle?.year?.toString() || '',
    vehicle_make: (vehicle?.make || '').toUpperCase(),
    vehicle_model: (vehicle?.model || '').toUpperCase(),
    vin: (vehicle?.vin || '').toUpperCase(),
    body_type: vehicle?.body_type || 'SEDAN',
    color: (vehicle?.color || '').toUpperCase(),
    stock_number: vehicle?.stock_number || '',
    odometer: formatNumber(vehicle?.miles || vehicle?.mileage || 0),

    // Sale
    sale_date: formatDate(deal.date_of_sale),
    purchase_date: formatDate(deal.date_of_sale),
    sale_price: formatCurrency(salePrice),
    purchase_price: formatCurrency(salePrice),
    trade_allowance: formatCurrency(tradeValue),
    sales_tax: formatCurrency(salesTax),

    // Financing (BHPH)
    ...(financing ? {
      principal: formatCurrency(financing.amountFinanced),
      apr: financing.apr.toFixed(2) + '%',
      interest_rate: financing.interestRate.toFixed(2) + '%',
      finance_charge: formatCurrency(financing.financeCharge),
      total_payments: formatCurrency(financing.totalOfPayments),
      monthly_payment: formatCurrency(financing.monthlyPayment),
      term_months: financing.termMonths.toString(),
      first_payment_date: formatDate(financing.firstPaymentDate),
      down_payment: formatCurrency(financing.downPayment)
    } : {}),

    // Lienholder (BHPH = dealer)
    lienholder_name: deal.deal_type === 'BHPH' ? dealer?.dealer_name : '',
    lienholder_address: deal.deal_type === 'BHPH' ? dealer?.address : ''
  };
}

// ============================================
// FINANCING CALCULATOR
// ============================================
function calculateFinancing(deal) {
  const price = parseFloat(deal.price) || 0;
  const downPayment = parseFloat(deal.down_payment) || 0;
  const tradeValue = parseFloat(deal.trade_value) || 0;
  const tradePayoff = parseFloat(deal.trade_payoff) || 0;
  const docFee = parseFloat(deal.doc_fee) || 299;
  const termMonths = parseInt(deal.term_months) || 48;
  const interestRate = parseFloat(deal.interest_rate) || 18;

  const gap = parseFloat(deal.gap_insurance) || 0;
  const warranty = parseFloat(deal.extended_warranty) || 0;
  const protection = parseFloat(deal.protection_package) || 0;
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
    firstPaymentDate
  };
}

// ============================================
// FORMATTERS
// ============================================
function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value) {
  return (parseInt(value) || 0).toLocaleString('en-US');
}

// ============================================
// FILL PDF FORM
// ============================================
async function fillPdfForm(pdfBytes, fieldMapping, context) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  try {
    const form = pdfDoc.getForm();
    
    for (const [contextKey, pdfFieldName] of Object.entries(fieldMapping || {})) {
      try {
        const value = context[contextKey];
        if (value === undefined || value === null || value === '') continue;
        
        try {
          const field = form.getTextField(pdfFieldName);
          field.setText(value.toString());
        } catch {
          try {
            const checkbox = form.getCheckBox(pdfFieldName);
            if (value === 'X' || value === true) checkbox.check();
          } catch {
            // Field not found
          }
        }
      } catch (err) {
        console.warn(`Could not fill ${pdfFieldName}:`, err.message);
      }
    }
    
    form.flatten();
  } catch (err) {
    console.warn('PDF may not have fillable fields:', err.message);
  }
  
  return await pdfDoc.save();
}

// ============================================
// EXECUTE DEAL - Generate all documents
// ============================================
export async function executeDeal(dealId, dealerId) {
  // Get deal
  const { data: deal, error: dealError } = await supabase
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .single();
  
  if (dealError || !deal) throw new Error('Deal not found');

  // Get vehicle
  const { data: vehicle } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', deal.vehicle_id)
    .single();

  // Get dealer
  const { data: dealer } = await supabase
    .from('dealer_settings')
    .select('*')
    .eq('id', dealerId)
    .single();

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

  // Get forms for this deal type
  const forms = await getDealForms(dealerId, deal.deal_type);
  
  if (!forms.length) {
    throw new Error(`No forms configured for ${deal.deal_type} deals. Check document_packages and form_registry.`);
  }

  const generated = [];
  const errors = [];

  for (const form of forms) {
    try {
      // Load template from storage
      const { data: templateData, error: downloadError } = await supabase.storage
        .from('form-templates')
        .download(form.storage_path);
      
      if (downloadError) {
        throw new Error(`Template not found: ${form.storage_path}`);
      }
      
      const templateBytes = await templateData.arrayBuffer();
      
      // Fill the form
      const filledPdfBytes = await fillPdfForm(templateBytes, form.field_mappings, context);
      
      // Save to deal-documents bucket
      const fileName = `${form.form_number}_${dealId}_${Date.now()}.pdf`;
      const storagePath = `dealers/${dealerId}/deals/${dealId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('deal-documents')
        .upload(storagePath, filledPdfBytes, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Record in generated_documents
      await supabase.from('generated_documents').insert({
        deal_id: dealId,
        form_library_id: form.id,
        form_number: form.form_number,
        form_name: form.form_name,
        storage_path: storagePath,
        generated_by: 'system'
      });

      generated.push({
        form_number: form.form_number,
        form_name: form.form_name,
        file_name: fileName,
        storage_path: storagePath
      });

    } catch (err) {
      console.error(`Failed to generate ${form.form_number}:`, err);
      errors.push({ form_number: form.form_number, error: err.message });
    }
  }

  // Update deal
  await supabase.from('deals')
    .update({ 
      generated_docs: generated.map(g => g.form_name),
      updated_at: new Date().toISOString()
    })
    .eq('id', dealId);

  return { generated, errors, total: forms.length };
}

// ============================================
// GET GENERATED DOCUMENTS FOR A DEAL
// ============================================
export async function getDealDocuments(dealId) {
  const { data, error } = await supabase
    .from('generated_documents')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at');
  
  if (error) throw error;
  return data || [];
}

// ============================================
// GET SIGNED URL FOR DOWNLOAD
// ============================================
export async function getDocumentUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('deal-documents')
    .createSignedUrl(storagePath, 3600);
  
  if (error) throw error;
  return data.signedUrl;
}

export default {
  getDealForms,
  buildFormContext,
  executeDeal,
  getDealDocuments,
  getDocumentUrl
};