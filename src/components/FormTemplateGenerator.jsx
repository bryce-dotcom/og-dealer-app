import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Available database fields for mapping
const AVAILABLE_FIELDS = {
  dealer: [
    { value: 'dealer.dealer_name', label: 'Dealer Name' },
    { value: 'dealer.address', label: 'Dealer Address' },
    { value: 'dealer.city', label: 'Dealer City' },
    { value: 'dealer.state', label: 'Dealer State' },
    { value: 'dealer.zip', label: 'Dealer ZIP' },
    { value: 'dealer.phone', label: 'Dealer Phone' },
    { value: 'dealer.dealer_license', label: 'Dealer License #' },
  ],
  buyer: [
    { value: 'deal.purchaser_name', label: 'Buyer Name' },
    { value: 'customer.address', label: 'Buyer Address' },
    { value: 'customer.city', label: 'Buyer City' },
    { value: 'customer.state', label: 'Buyer State' },
    { value: 'customer.zip', label: 'Buyer ZIP' },
    { value: 'customer.phone', label: 'Buyer Phone' },
    { value: 'customer.email', label: 'Buyer Email' },
    { value: 'customer.dl_number', label: 'Buyer DL Number' },
    { value: 'customer.dl_state', label: 'Buyer DL State' },
  ],
  vehicle: [
    { value: 'vehicle.year', label: 'Year' },
    { value: 'vehicle.make', label: 'Make' },
    { value: 'vehicle.model', label: 'Model' },
    { value: 'vehicle.trim', label: 'Trim' },
    { value: 'vehicle.vin', label: 'VIN' },
    { value: 'vehicle.stock_number', label: 'Stock Number' },
    { value: 'vehicle.miles', label: 'Mileage' },
    { value: 'vehicle.color', label: 'Color' },
    { value: 'vehicle.body_style', label: 'Body Style' },
  ],
  deal: [
    { value: 'deal.sale_price', label: 'Sale Price' },
    { value: 'deal.trade_allowance', label: 'Trade Allowance' },
    { value: 'deal.trade_payoff', label: 'Trade Payoff' },
    { value: 'deal.down_payment', label: 'Down Payment' },
    { value: 'deal.total_due', label: 'Total Due' },
    { value: 'deal.tax_amount', label: 'Tax Amount' },
    { value: 'deal.doc_fee', label: 'Doc Fee' },
    { value: 'deal.title_fee', label: 'Title Fee' },
    { value: 'deal.registration_fee', label: 'Registration Fee' },
    { value: 'deal.date_of_sale', label: 'Date of Sale' },
    { value: 'deal.salesman', label: 'Salesperson' },
  ],
  financing: [
    { value: 'deal.term_months', label: 'Term (Months)' },
    { value: 'deal.interest_rate', label: 'Interest Rate' },
    { value: 'deal.monthly_payment', label: 'Monthly Payment' },
    { value: 'deal.first_payment_date', label: 'First Payment Date' },
    { value: 'deal.final_payment_date', label: 'Final Payment Date' },
    { value: 'deal.total_of_payments', label: 'Total of Payments' },
    { value: 'deal.apr', label: 'APR' },
    { value: 'deal.amount_financed', label: 'Amount Financed' },
    { value: 'deal.finance_charge', label: 'Finance Charge' },
  ],
  signatures: [
    { value: 'signature.buyer', label: 'Buyer Signature' },
    { value: 'signature.seller', label: 'Seller Signature' },
    { value: 'signature.date', label: 'Signature Date' },
    { value: 'signature.co_buyer', label: 'Co-Buyer Signature' },
  ],
};

// Flatten for dropdown
const ALL_FIELDS = Object.entries(AVAILABLE_FIELDS).flatMap(([group, fields]) =>
  fields.map(f => ({ ...f, group }))
);

export default function FormTemplateGenerator({ formId, pdfUrl, formName, state, onSave, onClose }) {
  const [htmlContent, setHtmlContent] = useState('');
  const [detectedFields, setDetectedFields] = useState([]);
  const [fieldMappings, setFieldMappings] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedHtml, setEditedHtml] = useState('');
  const [activeTab, setActiveTab] = useState('preview'); // 'preview', 'mapping', 'html'
  const iframeRef = useRef(null);

  // Load existing template if available
  useEffect(() => {
    if (formId) {
      loadExistingTemplate();
    }
  }, [formId]);

  const loadExistingTemplate = async () => {
    try {
      const { data: form, error } = await supabase
        .from('form_staging')
        .select('html_template_url, field_mapping, template_status')
        .eq('id', formId)
        .single();

      if (error) throw error;

      if (form?.html_template_url && form.template_status === 'ready') {
        // Download HTML from storage
        const { data: htmlData, error: downloadError } = await supabase.storage
          .from('form-templates')
          .download(form.html_template_url);

        if (!downloadError && htmlData) {
          const html = await htmlData.text();
          setHtmlContent(html);
          setEditedHtml(html);

          // Extract fields
          const fieldRegex = /data-field=["']([^"']+)["']/gi;
          const fields = [];
          let match;
          while ((match = fieldRegex.exec(html)) !== null) {
            if (!fields.includes(match[1])) fields.push(match[1]);
          }
          setDetectedFields(fields);

          // Load mappings
          if (form.field_mapping) {
            setFieldMappings(form.field_mapping);
          }
        }
      }
    } catch (err) {
      console.error('Error loading template:', err);
    }
  };

  const generateTemplate = async () => {
    if (!pdfUrl) {
      setError('No PDF URL provided. Please ensure the form has a valid PDF source.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    // 60 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      setError('Request timed out after 60 seconds. The PDF may be too large or the server is busy. Please try again.');
      setIsGenerating(false);
    }, 60000);

    try {
      // First, validate the PDF URL is accessible
      try {
        const checkResponse = await fetch(pdfUrl, { method: 'HEAD', signal: controller.signal });
        if (!checkResponse.ok) {
          clearTimeout(timeoutId);
          setError(`PDF not accessible (HTTP ${checkResponse.status}). The link may be broken or the file was moved.`);
          setIsGenerating(false);
          return;
        }
      } catch (fetchErr) {
        // If HEAD fails, try anyway - some servers don't support HEAD
        console.log('HEAD check failed, proceeding anyway:', fetchErr.message);
      }

      const { data, error } = await supabase.functions.invoke('generate-form-template', {
        body: {
          pdf_url: pdfUrl,
          form_name: formName,
          state: state,
          form_id: formId
        }
      });

      clearTimeout(timeoutId);

      if (error) {
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          throw new Error('PDF not found (404). The link may be outdated.');
        }
        throw error;
      }
      if (!data.success) {
        if (data.error?.includes('Failed to download') || data.error?.includes('404')) {
          throw new Error('PDF could not be downloaded. Please check the source URL is correct.');
        }
        throw new Error(data.error);
      }

      setHtmlContent(data.html);
      setEditedHtml(data.html);
      setDetectedFields(data.detected_fields || []);

      // Update workflow_status to html_generated
      if (formId) {
        await supabase.from('form_staging').update({ workflow_status: 'html_generated' }).eq('id', formId);
      }

      // Initialize field mappings with smart defaults
      const initialMappings = {};
      (data.detected_fields || []).forEach(field => {
        initialMappings[field] = smartMatchField(field);
      });
      setFieldMappings(initialMappings);

    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setError('Request was cancelled or timed out.');
      } else {
        setError(err.message || 'An unexpected error occurred');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Smart match field names to database fields
  const smartMatchField = (fieldName) => {
    const lower = fieldName.toLowerCase();

    // Buyer fields
    if (lower.includes('buyer_name') || lower.includes('purchaser')) return 'deal.purchaser_name';
    if (lower.includes('buyer_address') || (lower.includes('buyer') && lower.includes('address'))) return 'customer.address';
    if (lower.includes('buyer_city')) return 'customer.city';
    if (lower.includes('buyer_state')) return 'customer.state';
    if (lower.includes('buyer_zip')) return 'customer.zip';
    if (lower.includes('buyer_phone')) return 'customer.phone';
    if (lower.includes('buyer_email')) return 'customer.email';
    if (lower.includes('dl_number') || lower.includes('license_number')) return 'customer.dl_number';

    // Dealer fields
    if (lower.includes('dealer_name') || lower.includes('seller_name')) return 'dealer.dealer_name';
    if (lower.includes('dealer_address') || lower.includes('seller_address')) return 'dealer.address';
    if (lower.includes('dealer_license')) return 'dealer.dealer_license';
    if (lower.includes('dealer_phone')) return 'dealer.phone';

    // Vehicle fields
    if (lower === 'year' || lower === 'vehicle_year') return 'vehicle.year';
    if (lower === 'make' || lower === 'vehicle_make') return 'vehicle.make';
    if (lower === 'model' || lower === 'vehicle_model') return 'vehicle.model';
    if (lower === 'vin' || lower === 'vehicle_vin') return 'vehicle.vin';
    if (lower.includes('stock')) return 'vehicle.stock_number';
    if (lower.includes('mile') || lower.includes('odometer')) return 'vehicle.miles';
    if (lower === 'color') return 'vehicle.color';
    if (lower.includes('body')) return 'vehicle.body_style';

    // Sale fields
    if (lower.includes('sale_price') || lower.includes('purchase_price')) return 'deal.sale_price';
    if (lower.includes('trade_allow')) return 'deal.trade_allowance';
    if (lower.includes('trade_payoff')) return 'deal.trade_payoff';
    if (lower.includes('down_payment')) return 'deal.down_payment';
    if (lower.includes('total_due') || lower.includes('total_price')) return 'deal.total_due';
    if (lower.includes('tax')) return 'deal.tax_amount';
    if (lower.includes('doc_fee')) return 'deal.doc_fee';
    if (lower.includes('date_of_sale') || lower.includes('sale_date')) return 'deal.date_of_sale';

    // Financing
    if (lower.includes('term')) return 'deal.term_months';
    if (lower.includes('interest') || lower === 'apr') return 'deal.interest_rate';
    if (lower.includes('monthly') || lower.includes('payment_amount')) return 'deal.monthly_payment';
    if (lower.includes('first_payment')) return 'deal.first_payment_date';
    if (lower.includes('total_of_payment') || lower.includes('total_payments')) return 'deal.total_of_payments';
    if (lower.includes('amount_financed') || lower.includes('principal')) return 'deal.amount_financed';
    if (lower.includes('finance_charge')) return 'deal.finance_charge';

    // Signatures
    if (lower.includes('buyer_sig')) return 'signature.buyer';
    if (lower.includes('seller_sig') || lower.includes('dealer_sig')) return 'signature.seller';
    if (lower.includes('signature_date') || lower.includes('sig_date')) return 'signature.date';

    return null;
  };

  const updateMapping = (field, value) => {
    setFieldMappings(prev => ({ ...prev, [field]: value || null }));
  };

  const applyHtmlEdits = () => {
    setHtmlContent(editedHtml);
    setEditMode(false);

    // Re-extract fields
    const fieldRegex = /data-field=["']([^"']+)["']/gi;
    const fields = [];
    let match;
    while ((match = fieldRegex.exec(editedHtml)) !== null) {
      if (!fields.includes(match[1])) fields.push(match[1]);
    }
    setDetectedFields(fields);
  };

  const saveTemplate = async () => {
    if (!formId || !htmlContent) {
      setError('Missing form ID or HTML content');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const safeState = (state || 'XX').toUpperCase();
      const htmlPath = `${safeState}/${formId}.html`;
      const mappingPath = `${safeState}/${formId}_mapping.json`;

      // Upload HTML
      const { error: htmlError } = await supabase.storage
        .from('form-templates')
        .upload(htmlPath, new TextEncoder().encode(htmlContent), {
          contentType: 'text/html',
          upsert: true
        });

      if (htmlError) throw htmlError;

      // Upload mapping JSON
      const { error: mappingError } = await supabase.storage
        .from('form-templates')
        .upload(mappingPath, new TextEncoder().encode(JSON.stringify(fieldMappings, null, 2)), {
          contentType: 'application/json',
          upsert: true
        });

      if (mappingError) throw mappingError;

      // Update form_staging with workflow_status = 'mapped'
      const { error: updateError } = await supabase
        .from('form_staging')
        .update({
          html_template_url: htmlPath,
          field_mapping: fieldMappings,
          template_status: 'ready',
          workflow_status: 'mapped'
        })
        .eq('id', formId);

      if (updateError) throw updateError;

      if (onSave) onSave({ htmlPath, mappingPath, fieldMappings });

    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Count mapped vs unmapped fields
  const mappedCount = Object.values(fieldMappings).filter(v => v).length;
  const unmappedCount = detectedFields.length - mappedCount;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              HTML Template Generator
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formName || 'Untitled Form'} {state && `(${state})`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {detectedFields.length > 0 && (
              <span className="text-sm text-gray-500">
                {mappedCount}/{detectedFields.length} fields mapped
                {unmappedCount > 0 && <span className="text-yellow-500 ml-1">({unmappedCount} unmapped)</span>}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error display with retry */}
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded flex items-center justify-between">
            <div>
              <strong>Error:</strong> {error}
            </div>
            <div className="flex gap-2">
              <button
                onClick={generateTemplate}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Retry
              </button>
              <button
                onClick={() => setError(null)}
                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex border-b dark:border-gray-700 px-4">
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2 font-medium ${activeTab === 'preview'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'}`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab('mapping')}
            className={`px-4 py-2 font-medium ${activeTab === 'mapping'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'}`}
          >
            Field Mapping ({detectedFields.length})
          </button>
          <button
            onClick={() => { setActiveTab('html'); setEditedHtml(htmlContent); }}
            className={`px-4 py-2 font-medium ${activeTab === 'html'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'}`}
          >
            Edit HTML
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'preview' && (
            <div className="h-full flex">
              {/* PDF Preview - Left Side */}
              <div className="w-1/2 h-full border-r dark:border-gray-700 flex flex-col">
                <div className="p-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 text-sm font-medium">
                  Original PDF
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {pdfUrl ? (
                    <iframe
                      src={pdfUrl}
                      className="w-full h-full border rounded"
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      No PDF URL provided
                    </div>
                  )}
                </div>
              </div>

              {/* HTML Preview - Right Side */}
              <div className="w-1/2 h-full flex flex-col">
                <div className="p-2 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 text-sm font-medium">
                  Generated HTML Template
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {htmlContent ? (
                    <iframe
                      ref={iframeRef}
                      srcDoc={htmlContent}
                      className="w-full h-full border rounded bg-white"
                      title="HTML Preview"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      {isGenerating ? (
                        <div className="text-center">
                          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                          <p>Generating HTML template with Claude AI...</p>
                          <p className="text-xs mt-1">This may take 30-60 seconds</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p>Click "Generate Template" to create HTML from PDF</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mapping' && (
            <div className="h-full overflow-auto p-4">
              {detectedFields.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No fields detected. Generate a template first.
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Map each detected field to a database column. Fields marked with * are unmapped.
                    </p>
                    <button
                      onClick={() => {
                        const newMappings = {};
                        detectedFields.forEach(field => {
                          newMappings[field] = smartMatchField(field);
                        });
                        setFieldMappings(newMappings);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Auto-map all fields
                    </button>
                  </div>

                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700">
                        <th className="text-left p-3 border dark:border-gray-600">Field in Template</th>
                        <th className="text-left p-3 border dark:border-gray-600">Maps To Database Field</th>
                        <th className="w-20 p-3 border dark:border-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectedFields.map(field => (
                        <tr key={field} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="p-3 border dark:border-gray-600 font-mono text-sm">
                            {field}
                            {!fieldMappings[field] && <span className="text-red-500 ml-1">*</span>}
                          </td>
                          <td className="p-3 border dark:border-gray-600">
                            <select
                              value={fieldMappings[field] || ''}
                              onChange={(e) => updateMapping(field, e.target.value)}
                              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600"
                            >
                              <option value="">-- Select field --</option>
                              {Object.entries(AVAILABLE_FIELDS).map(([group, fields]) => (
                                <optgroup key={group} label={group.charAt(0).toUpperCase() + group.slice(1)}>
                                  {fields.map(f => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 border dark:border-gray-600 text-center">
                            {fieldMappings[field] ? (
                              <span className="text-green-500">Mapped</span>
                            ) : (
                              <span className="text-yellow-500">Unmapped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'html' && (
            <div className="h-full flex flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Edit the HTML source. Changes will be reflected in the preview.
                </p>
                <button
                  onClick={applyHtmlEdits}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Apply Changes
                </button>
              </div>
              <textarea
                value={editedHtml}
                onChange={(e) => setEditedHtml(e.target.value)}
                className="flex-1 w-full p-3 font-mono text-sm border rounded dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className="flex items-center justify-between p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex gap-2">
            <button
              onClick={generateTemplate}
              disabled={isGenerating || !pdfUrl}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Template
                </>
              )}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={saveTemplate}
              disabled={isSaving || !htmlContent || detectedFields.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Template
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
