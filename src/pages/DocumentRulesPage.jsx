import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function DocumentRulesPage() {
  const { dealerId, dealer } = useStore();
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Data
  const [forms, setForms] = useState([]);
  const [packages, setPackages] = useState([]);
  const [dealerCustomForms, setDealerCustomForms] = useState([]);

  // UI State
  const [activeTab, setActiveTab] = useState('forms');
  const [editingPackage, setEditingPackage] = useState(null);
  const [selectedForms, setSelectedForms] = useState([]);
  const [formFilter, setFormFilter] = useState('all');
  const [settingsModal, setSettingsModal] = useState(false);
  const [customDealTypes, setCustomDealTypes] = useState([]);
  const [newDealType, setNewDealType] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingForm, setUploadingForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ form_name: '', form_number: '', category: 'custom' });
  const [mappingForm, setMappingForm] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Default deal types (user can add more via settings)
  const defaultDealTypes = ['Cash', 'BHPH', 'Financing', 'Wholesale'];
  const dealTypes = [...defaultDealTypes, ...customDealTypes];
  const dealTypeColors = {
    Cash: '#22c55e',
    BHPH: '#8b5cf6',
    Financing: '#3b82f6',
    Wholesale: '#eab308'
  };

  const categoryColors = {
    deal: '#22c55e',
    title: '#3b82f6',
    financing: '#8b5cf6',
    tax: '#ef4444',
    disclosure: '#ec4899',
    registration: '#06b6d4',
    compliance: '#f97316',
    custom: '#f59e0b',
    other: '#71717a'
  };

  const fieldContextOptions = [
    { group: 'Buyer', fields: ['buyer_name','buyer_first','buyer_last','buyer_address','buyer_city','buyer_state','buyer_zip','buyer_phone','buyer_email','buyer_dl_number','buyer_dl_state','buyer_dob','purchaser_name','customer_name'] },
    { group: 'Co-Buyer', fields: ['co_buyer_name','co_buyer_first','co_buyer_last','co_buyer_address','co_buyer_city','co_buyer_state','co_buyer_zip','co_buyer_phone','co_buyer_email','co_buyer_dl_number'] },
    { group: 'Vehicle', fields: ['vehicle_year','vehicle_make','vehicle_model','vehicle_vin','vin','vehicle_miles','odometer','mileage','vehicle_color','color','vehicle_stock','stock_number','year','make','model','vehicle_trim'] },
    { group: 'Dealer', fields: ['dealer_name','dealer_address','dealer_city','dealer_state','dealer_zip','dealer_phone','dealer_email','dealer_license','seller_name','seller_address'] },
    { group: 'Pricing', fields: ['sale_price','price','down_payment','doc_fee','sales_tax','total_price','total_sale','balance_due'] },
    { group: 'Financing', fields: ['amount_financed','apr','interest_rate','term_months','monthly_payment','first_payment_date','total_of_payments','finance_charge','credit_score'] },
    { group: 'Trade-In', fields: ['trade_description','trade_year','trade_make','trade_model','trade_value','trade_acv','trade_allowance','trade_payoff','trade_vin','negative_equity','net_trade'] },
    { group: 'Add-Ons', fields: ['gap_insurance','extended_warranty','protection_package','tire_wheel','accessory_1_desc','accessory_1_price','accessory_2_desc','accessory_2_price','accessory_3_desc','accessory_3_price'] },
    { group: 'Lienholder', fields: ['lienholder_name','lienholder_address','lienholder_city','lienholder_state','lienholder_zip'] },
    { group: 'Other', fields: ['date_of_sale','sale_date','today','current_date','signature_date','salesman','deal_type','deal_status','deal_number'] },
  ];

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, [dealer?.state, dealerId]);

  // Load custom deal types from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`customDealTypes_${dealerId}`);
    if (saved) {
      try {
        setCustomDealTypes(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load custom deal types');
      }
    }
  }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const state = dealer?.state || 'UT';

    try {
      // Load forms from form_library for dealer's state
      const { data: formsData, error: formsError } = await supabase
        .from('form_library')
        .select('*')
        .eq('state', state)
        .eq('status', 'active');

      if (formsError) {
        console.error('[DocumentRules] Forms query error:', formsError);
        showToast('Error loading forms: ' + formsError.message, 'error');
      } else {
        console.log('[DocumentRules] Loaded', formsData?.length || 0, 'forms from form_library for', state);
        setForms(formsData || []);
      }

      // Load dealer custom forms
      let customData = [];
      if (dealerId) {
        const { data: customFormsData, error: customError } = await supabase
          .from('dealer_custom_forms')
          .select('*')
          .eq('dealer_id', dealerId)
          .order('created_at', { ascending: false });

        if (customError) {
          console.error('[DocumentRules] Custom forms error:', customError);
        } else {
          customData = customFormsData || [];
          setDealerCustomForms(customData);
        }
      }

      // Load document packages for this dealer
      if (dealerId) {
        const { data: pkgData, error: pkgError } = await supabase
          .from('document_packages')
          .select('*')
          .eq('dealer_id', dealerId);

        if (pkgError) {
          console.error('[DocumentRules] Packages error:', pkgError);
        } else {
          // Clean up deleted form references from packages
          const validFormIds = new Set([
            ...(formsData || []).map(f => f.id),
            ...customData.map(f => f.id)
          ]);

          let packagesNeedUpdate = false;
          const cleanedPackages = (pkgData || []).map(pkg => {
            if (!pkg.form_ids || pkg.form_ids.length === 0) return pkg;

            const originalLength = pkg.form_ids.length;
            const cleanedFormIds = pkg.form_ids.filter(id => validFormIds.has(id));

            if (cleanedFormIds.length !== originalLength) {
              packagesNeedUpdate = true;
              console.log(`[DocumentRules] Cleaning package ${pkg.deal_type}: removed ${originalLength - cleanedFormIds.length} deleted form(s)`);

              // Update package in database
              supabase
                .from('document_packages')
                .update({ form_ids: cleanedFormIds })
                .eq('id', pkg.id)
                .eq('dealer_id', dealerId)
                .then(({ error }) => {
                  if (error) console.error('[DocumentRules] Failed to update package:', error);
                });

              return { ...pkg, form_ids: cleanedFormIds };
            }

            return pkg;
          });

          setPackages(cleanedPackages);

          if (packagesNeedUpdate) {
            console.log('[DocumentRules] Auto-cleaned deleted form references from packages');
          }
        }
      }

    } catch (err) {
      console.error('[DocumentRules] Load error:', err);
      showToast('Failed to load data: ' + err.message, 'error');
    }

    setLoading(false);
  };

  // Save custom deal types
  const saveCustomDealTypes = (types) => {
    setCustomDealTypes(types);
    localStorage.setItem(`customDealTypes_${dealerId}`, JSON.stringify(types));
  };

  const addCustomDealType = () => {
    if (!newDealType.trim()) return;
    if (dealTypes.includes(newDealType.trim())) {
      showToast('Deal type already exists', 'error');
      return;
    }
    saveCustomDealTypes([...customDealTypes, newDealType.trim()]);
    setNewDealType('');
    showToast(`Added "${newDealType.trim()}" deal type`);
  };

  const removeCustomDealType = (type) => {
    saveCustomDealTypes(customDealTypes.filter(t => t !== type));
    showToast(`Removed "${type}" deal type`);
  };

  // Only forms the dealer uploaded (dealer_custom_forms) belong to this dealer.
  // Everything in form_library is a shared platform form used by every dealer,
  // so it is read-only here. Platform forms are managed in the Dev Console.
  const canEditForm = (form) => !!form?._isCustom;

  // Call an edge function through the Supabase client (uses the signed-in
  // user's session) and surface the real error message when it fails.
  const invokeEdgeFunction = async (name, body) => {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let msg = error.message || 'Request failed';
      try {
        if (error.context && typeof error.context.json === 'function') {
          const j = await error.context.json();
          if (j?.error) msg = j.error;
        }
      } catch { /* keep the generic message */ }
      return { data: null, errorMessage: msg };
    }
    if (data?.error) return { data, errorMessage: data.error };
    if (data && data.success === false) return { data, errorMessage: 'Request failed' };
    return { data, errorMessage: null };
  };

  // === MAPPING MODAL FUNCTIONS ===
  const openMappingModal = (form) => {
    // Deep clone the form's field_mappings so edits don't mutate state.
    // Mappings written directly by the map-form-fields function use a single
    // `universal_field` string; convert those to the UI's `universal_fields` array.
    const mappings = (form.field_mappings || []).map(m => {
      if (!m.universal_fields && m.universal_field && !m.status) {
        const uiField = aiToUiFieldMap[m.universal_field] || m.universal_field.split('.').pop();
        return { ...m, universal_fields: [uiField], status: 'mapped', matched: true };
      }
      return { ...m };
    });
    setMappingForm({ ...form, field_mappings: mappings, _isCustom: !!form._isCustom });
  };

  const updateFieldMapping = (index, field, value) => {
    setMappingForm(prev => {
      if (!prev) return prev;
      const newMappings = [...prev.field_mappings];
      newMappings[index] = { ...newMappings[index], [field]: value };

      // If setting a universal_field via dropdown, update status
      if (field === 'universal_fields') {
        newMappings[index].status = value.length > 0 ? 'mapped' : 'unmapped';
        newMappings[index].matched = value.length > 0;
        newMappings[index].confidence = value.length > 0 ? 1 : 0;
      }

      // If toggling highlight or dismissed, clear the mapping
      if (field === 'status') {
        if (value === 'highlight') {
          newMappings[index].universal_fields = [];
          newMappings[index].matched = false;
          newMappings[index].highlight_color = newMappings[index].highlight_color || '#ffff00';
        } else if (value === 'dismissed') {
          newMappings[index].universal_fields = [];
          newMappings[index].matched = false;
        }
      }

      return { ...prev, field_mappings: newMappings };
    });
  };

  const saveMappings = async () => {
    if (!mappingForm) return;
    if (!canEditForm(mappingForm)) {
      showToast('Shared state forms can only be changed by OG Dealer support.', 'error');
      return;
    }
    const mappings = mappingForm.field_mappings || [];
    const mappedCount = mappings.filter(f => f.status === 'mapped').length;
    const dismissedCount = mappings.filter(f => f.status === 'dismissed').length;
    const highlightCount = mappings.filter(f => f.status === 'highlight').length;
    const scorableTotal = mappings.length - dismissedCount - highlightCount;
    const confidence = scorableTotal > 0 ? Math.round((mappedCount / scorableTotal) * 100) : (mappings.length > 0 ? 100 : 0);

    const { error } = await supabase
      .from('dealer_custom_forms')
      .update({
        field_mappings: mappings,
        mapping_confidence: confidence,
        mapping_status: mappedCount > 0 ? 'mapped' : 'unmapped',
        updated_at: new Date().toISOString()
      })
      .eq('id', mappingForm.id)
      .eq('dealer_id', dealerId);

    if (error) {
      showToast('Save failed: ' + error.message, 'error');
      return;
    }
    showToast(`Saved - ${mappedCount} mapped, ${highlightCount} highlighted, ${dismissedCount} dismissed (${confidence}%)`);
    setMappingForm(null);
    loadData();
  };

  // === ANALYZE / AUTO-MAP ===
  const aiToUiFieldMap = {
    'dealer.dealer_name': 'dealer_name', 'dealer.dealer_license': 'dealer_license',
    'dealer.address': 'dealer_address', 'dealer.city': 'dealer_city', 'dealer.state': 'dealer_state',
    'dealer.zip': 'dealer_zip', 'dealer.phone': 'dealer_phone', 'dealer.email': 'dealer_email',
    'vehicle.vin': 'vin', 'vehicle.year': 'year', 'vehicle.make': 'make', 'vehicle.model': 'model',
    'vehicle.trim': 'vehicle_trim', 'vehicle.color': 'color', 'vehicle.mileage': 'mileage',
    'vehicle.stock_number': 'stock_number',
    'deal.purchaser_name': 'purchaser_name', 'deal.purchaser_address': 'buyer_address',
    'deal.date_of_sale': 'date_of_sale', 'deal.price': 'sale_price',
    'deal.down_payment': 'down_payment', 'deal.sales_tax': 'sales_tax', 'deal.total_price': 'total_price',
    'financing.loan_amount': 'amount_financed', 'financing.interest_rate': 'interest_rate',
    'financing.term_months': 'term_months', 'financing.monthly_payment': 'monthly_payment', 'financing.apr': 'apr',
  };

  // Convert AI mappings (category.field) to UI format (flat field names)
  const convertAiMappings = (fieldMappings) => (fieldMappings || []).map(m => {
    const uiField = m.universal_field ? (aiToUiFieldMap[m.universal_field] || m.universal_field.split('.').pop()) : null;
    return {
      pdf_field: m.pdf_field,
      pdf_field_type: m.pdf_field_type || 'text',
      universal_fields: uiField ? [uiField] : [],
      status: uiField ? 'mapped' : 'unmapped',
      confidence: m.confidence || 0,
      matched: !!uiField
    };
  });

  const analyzeFields = async () => {
    if (!mappingForm) return;
    // map-form-fields writes its result straight into the source table, so only
    // run it on the dealer's own forms, never on shared platform forms.
    if (!canEditForm(mappingForm)) {
      showToast('Auto-Map is only available for forms you uploaded.', 'error');
      return;
    }
    setAnalyzing(true);
    try {
      const { data: result, errorMessage } = await invokeEdgeFunction('map-form-fields', {
        form_id: mappingForm.id,
        source_table: 'dealer_custom_forms'
      });
      if (errorMessage) throw new Error(errorMessage);

      setMappingForm(prev => ({ ...prev, field_mappings: convertAiMappings(result.field_mappings) }));
      showToast(`Auto-mapped ${result.mapped_count}/${result.detected_fields_count} fields (${result.mapping_confidence}%). Check them, then Save.`);
    } catch (err) {
      console.error('Analyze error:', err);
      showToast('Auto-Map failed: ' + err.message, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  // === CUSTOM FORM FUNCTIONS ===
  const handleCustomFormUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.pdf')) {
      showToast('Please select a PDF file', 'error');
      return;
    }

    setUploadingForm(true);
    // 1. Upload to storage
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${dealerId}/${Date.now()}_${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('dealer-forms')
      .upload(storagePath, file, { contentType: 'application/pdf' });

    if (uploadError) {
      showToast('Upload failed: ' + uploadError.message, 'error');
      setUploadingForm(false);
      return;
    }

    // 2. Create the database record
    const { data: newForm, error: insertError } = await supabase
      .from('dealer_custom_forms')
      .insert({
        dealer_id: dealerId,
        form_name: uploadForm.form_name || file.name.replace('.pdf', ''),
        form_number: uploadForm.form_number || null,
        category: uploadForm.category || 'custom',
        storage_bucket: 'dealer-forms',
        storage_path: storagePath,
        file_size_bytes: file.size,
        mapping_status: 'pending'
      })
      .select()
      .single();

    if (insertError || !newForm) {
      // Don't leave an orphaned PDF in storage
      await supabase.storage.from('dealer-forms').remove([storagePath]);
      showToast('Upload failed: ' + (insertError?.message || 'form was not saved'), 'error');
      setUploadingForm(false);
      return;
    }

    // 3. Find the fillable blanks and suggest matches. map-form-fields reads the
    //    PDF from storage and saves detected_fields / field_mappings on the row.
    const { data: mapResult, errorMessage } = await invokeEdgeFunction('map-form-fields', {
      form_id: newForm.id,
      source_table: 'dealer_custom_forms'
    });

    setShowUploadModal(false);
    setUploadForm({ form_name: '', form_number: '', category: 'custom' });
    setUploadingForm(false);
    loadData();

    if (errorMessage) {
      showToast(`Form saved, but reading its fields failed: ${errorMessage}. Open it and click Auto-Map to try again.`, 'error');
      return;
    }

    const fieldsCount = mapResult?.detected_fields_count || 0;
    if (fieldsCount > 0) {
      showToast(`Form uploaded - ${fieldsCount} fillable fields found. Check the matches, then Save.`);
      openMappingModal({ ...newForm, field_mappings: convertAiMappings(mapResult.field_mappings), _isCustom: true });
    } else {
      showToast('Form uploaded, but it has no fillable fields. It will print as-is.');
    }
  };

  const deleteForm = async (form) => {
    if (!canEditForm(form)) {
      showToast('Shared state forms are used by every dealer and cannot be deleted here. Leave it out of your Doc Packages instead.', 'error');
      return;
    }

    if (!confirm(`Delete your form "${form.form_name}"?\n\nIt will also be removed from your Doc Packages. This cannot be undone.`)) return;

    const { error } = await supabase
      .from('dealer_custom_forms')
      .delete()
      .eq('id', form.id)
      .eq('dealer_id', dealerId);
    if (error) {
      showToast('Delete failed: ' + error.message, 'error');
      return;
    }

    if (form.storage_path) {
      const { error: storageError } = await supabase.storage.from(form.storage_bucket || 'dealer-forms').remove([form.storage_path]);
      if (storageError) console.error('[DocumentRules] Could not remove PDF from storage:', storageError);
    }

    showToast('Form deleted');
    // loadData also strips the deleted form out of this dealer's packages
    loadData();
  };

  // Keep old function name for compatibility
  const deleteCustomForm = deleteForm;

  // === PACKAGE FUNCTIONS ===
  const getPackage = (dealType) => packages.find(p => p.deal_type === dealType);

  const startEditPackage = (dealType) => {
    const existing = getPackage(dealType);
    setEditingPackage(dealType);
    setSelectedForms(existing?.form_ids || []);
  };

  const savePackage = async () => {
    if (!editingPackage) return;
    try {
      const existing = getPackage(editingPackage);
      const packageData = {
        dealer_id: dealerId,
        deal_type: editingPackage,
        form_ids: selectedForms,
        state: dealer?.state || 'UT',
        updated_at: new Date().toISOString()
      };

      const { error } = existing
        ? await supabase.from('document_packages').update(packageData).eq('id', existing.id).eq('dealer_id', dealerId)
        : await supabase.from('document_packages').insert(packageData);
      if (error) throw error;
      showToast(`${editingPackage} package saved`);
      setEditingPackage(null);
      setSelectedForms([]);
      loadData();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  };

  const toggleForm = (formId) => {
    if (selectedForms.includes(formId)) {
      setSelectedForms(selectedForms.filter(f => f !== formId));
    } else {
      setSelectedForms([...selectedForms, formId]);
    }
  };

  // === HELPERS ===
  const getFormById = (id) => forms.find(f => f.id === id) || dealerCustomForms.find(f => f.id === id);

  // Combine platform forms + custom forms for category grouping
  const allForms = [...forms, ...dealerCustomForms.map(f => ({ ...f, _isCustom: true }))];

  const formsByCategory = allForms.reduce((acc, form) => {
    const cat = form.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(form);
    return acc;
  }, {});

  const sortedCategories = ['deal', 'title', 'financing', 'tax', 'disclosure', 'registration', 'compliance', 'custom', 'other']
    .filter(cat => formsByCategory[cat]);

  const getFilteredForms = () => {
    if (formFilter === 'all') return allForms;
    if (formFilter === 'mapped') return allForms.filter(f => f.mapping_confidence >= 70);
    if (formFilter === 'unmapped') return allForms.filter(f => !f.detected_fields?.length);
    if (formFilter === 'custom') return dealerCustomForms.map(f => ({ ...f, _isCustom: true }));
    return allForms.filter(f => f.category === formFilter);
  };

  // Styles
  const btnPrimary = { backgroundColor: '#3b82f6', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const btnSecondary = { backgroundColor: '#3f3f46', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', cursor: 'pointer' };
  const btnSuccess = { backgroundColor: '#22c55e', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const cardStyle = { backgroundColor: '#27272a', borderRadius: '12px', padding: '20px', marginBottom: '16px' };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#18181b', padding: '24px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '8px' }}>Loading...</div>
          <div style={{ color: '#71717a' }}>Fetching {dealer?.state || 'UT'} documents</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#18181b', padding: '24px', color: '#fff' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px 0' }}>Document Rules</h1>
            <p style={{ color: '#a1a1aa', margin: '0 0 4px 0', fontSize: '14px' }}>
              Choose which forms print for each type of sale. State forms are provided for you; you can also upload your own PDFs.
            </p>
            <p style={{ color: '#71717a', margin: 0, fontSize: '13px' }}>
              {dealer?.state || 'UT'} • {forms.length} platform forms • {dealerCustomForms.length} custom • {packages.length} packages
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowUploadModal(true)}
              style={{ ...btnPrimary, backgroundColor: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              + Upload Custom Form
            </button>
            <button
              onClick={() => setSettingsModal(true)}
              style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '8px' }}
              title="Package Settings"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Total Forms</div>
            <div style={{ fontSize: '28px', fontWeight: '700' }}>{forms.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Ready to Use</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{forms.filter(f => f.mapping_confidence >= 70).length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Custom Forms</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b' }}>{dealerCustomForms.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Packages</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#8b5cf6' }}>{packages.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #3f3f46', paddingBottom: '4px' }}>
          {[
            { id: 'forms', label: 'Form Library', count: allForms.length },
            { id: 'packages', label: 'Doc Packages', count: packages.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px', borderRadius: '8px 8px 0 0', border: 'none',
                backgroundColor: activeTab === tab.id ? '#27272a' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#71717a',
                fontWeight: '600', cursor: 'pointer',
                borderBottom: activeTab === tab.id ? '2px solid #f97316' : '2px solid transparent',
              }}
            >
              {tab.label}
              <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', backgroundColor: '#3f3f46' }}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* === FORMS TAB === */}
        {activeTab === 'forms' && (
          <div>
            <p style={{ color: '#71717a', fontSize: '13px', margin: '0 0 12px 0' }}>
              Click a form to see its <b style={{ color: '#a1a1aa' }}>field mappings</b>: which blank on the PDF gets which deal detail (buyer name, VIN, price).
              The % is how many blanks are matched; 70% or more counts as Ready. State forms are shared and read-only; forms marked CUSTOM are yours to edit or delete.
            </p>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {['all', 'mapped', 'unmapped', ...(dealerCustomForms.length > 0 ? ['custom'] : [])].map(filter => (
                <button
                  key={filter}
                  onClick={() => setFormFilter(filter)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
                    backgroundColor: formFilter === filter ? '#f97316' : '#3f3f46',
                    color: '#fff', textTransform: 'capitalize'
                  }}
                >
                  {filter === 'mapped' ? 'Ready' : filter === 'unmapped' ? 'Pending' : filter === 'custom' ? `Custom (${dealerCustomForms.length})` : filter}
                </button>
              ))}
            </div>

            {forms.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '60px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                <h3 style={{ margin: '0 0 8px 0' }}>No Forms Available</h3>
                <p style={{ color: '#71717a', margin: 0 }}>
                  Your state's forms haven't been added to the library yet.<br/>
                  Contact support to get {dealer?.state || 'your state'}'s DMV forms added.
                </p>
              </div>
            ) : (
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#71717a' }}>Form Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#71717a' }}>Category</th>
                      <th style={{ textAlign: 'center', padding: '12px 8px', color: '#71717a' }}>Fields</th>
                      <th style={{ textAlign: 'center', padding: '12px 8px', color: '#71717a' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredForms().map(form => {
                      const fieldsCount = form.detected_fields?.length || 0;
                      const confidence = form.mapping_confidence || 0;
                      const isReady = confidence >= 70;
                      const isCustom = form._isCustom;
                      // Custom forms can always be opened (so Auto-Map can be run on them);
                      // shared forms only when there is something to look at.
                      const canOpen = isCustom || fieldsCount > 0;

                      return (
                        <tr
                          key={form.id}
                          style={{ borderBottom: '1px solid #3f3f46', cursor: canOpen ? 'pointer' : 'default' }}
                          onClick={() => canOpen && openMappingModal(form)}
                        >
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {form.form_name}
                              {isCustom && (
                                <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '9px', backgroundColor: '#f59e0b30', color: '#f59e0b', fontWeight: '700' }}>CUSTOM</span>
                              )}
                            </div>
                            {form.form_number && (
                              <div style={{ color: '#22c55e', fontSize: '11px', fontFamily: 'monospace' }}>{form.form_number}</div>
                            )}
                            {form.description && (
                              <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{form.description.substring(0, 60)}...</div>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: '4px', fontSize: '10px',
                              backgroundColor: categoryColors[form.category] || '#3f3f46',
                              color: '#fff', textTransform: 'uppercase'
                            }}>
                              {form.category || 'other'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {fieldsCount > 0 ? (
                              <span style={{ color: '#a1a1aa' }}>{fieldsCount}</span>
                            ) : (
                              <span style={{ color: '#52525b' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            {isReady ? (
                              <span style={{
                                padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
                                backgroundColor: '#22c55e20', color: '#22c55e', fontWeight: '600'
                              }}>
                                Ready
                              </span>
                            ) : fieldsCount > 0 ? (
                              <span style={{
                                padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
                                backgroundColor: '#eab30820', color: '#eab308', fontWeight: '600'
                              }}>
                                {confidence}% mapped
                              </span>
                            ) : (
                              <span style={{
                                padding: '4px 10px', borderRadius: '4px', fontSize: '11px',
                                backgroundColor: '#3f3f46', color: '#71717a'
                              }}>
                                Pending
                              </span>
                            )}
                            {canEditForm(form) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteForm(form); }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  padding: '4px 6px'
                                }}
                                title="Delete your custom form"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {getFilteredForms().length === 0 && (
                  <p style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>No forms match this filter.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* === PACKAGES TAB === */}
        {activeTab === 'packages' && (
          <div>
            <p style={{ color: '#71717a', marginBottom: '20px' }}>
              Configure which documents are required for each deal type. These will auto-generate when you close a deal.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {dealTypes.map(dealType => {
                const pkg = getPackage(dealType);
                const formIds = pkg?.form_ids || [];
                const pkgForms = formIds.map(id => getFormById(id)).filter(Boolean);
                const isCustom = customDealTypes.includes(dealType);
                return (
                  <div key={dealType} style={{ ...cardStyle, borderLeft: `4px solid ${dealTypeColors[dealType] || '#f97316'}`, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>
                        {dealType}
                        {isCustom && <span style={{ fontSize: '10px', color: '#71717a', marginLeft: '8px' }}>(custom)</span>}
                      </h3>
                      <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                        backgroundColor: pkgForms.length > 0 ? `${dealTypeColors[dealType] || '#f97316'}20` : '#3f3f46',
                        color: pkgForms.length > 0 ? (dealTypeColors[dealType] || '#f97316') : '#71717a'
                      }}>
                        {pkgForms.length} docs
                      </span>
                    </div>
                    {pkgForms.length > 0 ? (
                      <div style={{ marginBottom: '12px' }}>
                        {pkgForms.slice(0, 4).map((form, i) => (
                          <div key={i} style={{ fontSize: '13px', color: '#a1a1aa', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#22c55e', fontFamily: 'monospace', fontSize: '11px' }}>{form.form_number || '—'}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.form_name}</span>
                            {(form.mapping_confidence || 0) >= 70 && <span style={{ fontSize: '10px', color: '#22c55e' }}>✓</span>}
                          </div>
                        ))}
                        {pkgForms.length > 4 && (
                          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>+{pkgForms.length - 4} more</div>
                        )}
                      </div>
                    ) : (
                      <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '12px' }}>No documents configured</p>
                    )}
                    <button
                      onClick={() => startEditPackage(dealType)}
                      style={{
                        width: '100%', padding: '8px', borderRadius: '6px', border: 'none',
                        backgroundColor: dealTypeColors[dealType] || '#f97316', color: '#fff', fontWeight: '600',
                        cursor: 'pointer', fontSize: '13px'
                      }}
                    >
                      {pkgForms.length > 0 ? 'Edit Package' : 'Configure'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* === PACKAGE EDITOR MODAL === */}
      {editingPackage && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '700px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
                  <span style={{ color: dealTypeColors[editingPackage] || '#f97316' }}>{editingPackage}</span> Package
                </h2>
                <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '13px' }}>
                  Select documents • {selectedForms.length} selected
                </p>
              </div>
              <button onClick={() => { setEditingPackage(null); setSelectedForms([]); }} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {sortedCategories.map(category => (
                <div key={category} style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#71717a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: categoryColors[category] || '#3f3f46' }} />
                    {category} ({formsByCategory[category].length})
                  </h4>
                  {formsByCategory[category].map(form => {
                    const isSelected = selectedForms.includes(form.id);
                    const confidence = form.mapping_confidence || 0;
                    return (
                      <div
                        key={form.id}
                        onClick={() => toggleForm(form.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                          backgroundColor: isSelected ? `${dealTypeColors[editingPackage] || '#f97316'}15` : '#27272a',
                          borderRadius: '8px', marginBottom: '8px', cursor: 'pointer',
                          border: isSelected ? `2px solid ${dealTypeColors[editingPackage] || '#f97316'}` : '2px solid transparent'
                        }}
                      >
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '6px',
                          backgroundColor: isSelected ? (dealTypeColors[editingPackage] || '#f97316') : '#3f3f46',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: '14px' }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#22c55e', fontFamily: 'monospace' }}>{form.form_number || '—'}</span>
                            {form.form_name}
                            {confidence >= 70 && <span style={{ fontSize: '10px', color: '#22c55e', padding: '1px 4px', backgroundColor: '#22c55e20', borderRadius: '3px' }}>Ready</span>}
                          </div>
                          {form.description && <div style={{ color: '#71717a', fontSize: '12px', marginTop: '2px' }}>{form.description.substring(0, 60)}...</div>}
                        </div>
                        {confidence > 0 && (
                          <div style={{ width: '40px', height: '4px', backgroundColor: '#3f3f46', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${confidence}%`, height: '100%', backgroundColor: confidence >= 70 ? '#22c55e' : '#eab308' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {forms.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                  No forms available. Contact support to get forms added to the library.
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#a1a1aa', fontSize: '13px' }}>{selectedForms.length} documents selected</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setEditingPackage(null); setSelectedForms([]); }} style={btnSecondary}>Cancel</button>
                <button onClick={savePackage} style={{ ...btnSuccess, backgroundColor: dealTypeColors[editingPackage] || '#f97316' }}>Save Package</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === INTERACTIVE FIELD MAPPER MODAL === */}
      {mappingForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '900px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            {/* Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
                  Field Mappings
                  {mappingForm._isCustom && <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: '#f59e0b30', color: '#f59e0b' }}>CUSTOM</span>}
                </h2>
                <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '13px' }}>
                  {mappingForm.form_name} {mappingForm.form_number ? `(${mappingForm.form_number})` : ''} • {mappingForm.field_mappings?.length || 0} fields
                </p>
              </div>
              <button onClick={() => setMappingForm(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>x</button>
            </div>

            {/* Plain-English help */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #27272a', fontSize: '12px', color: '#a1a1aa', lineHeight: 1.6 }}>
              Each row is a blank on the PDF. Pick which deal detail fills it in (for example, buyer name or VIN).
              {' '}<b>HL</b> = leave it blank and highlight it yellow so someone fills it in by hand. <b>X</b> = ignore this blank.
              {canEditForm(mappingForm) && <> <b>Auto-Map</b> reads the PDF and guesses the matches for you. Check them before you save.</>}
            </div>
            {!canEditForm(mappingForm) && (
              <div style={{ padding: '10px 20px', backgroundColor: 'rgba(59,130,246,0.08)', borderBottom: '1px solid #27272a', fontSize: '12px', color: '#93c5fd' }}>
                This is a shared state form kept up to date by OG Dealer, so it is view-only. If it fills in wrong, contact support.
              </div>
            )}

            {/* Field List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                {(mappingForm.field_mappings || []).map((mapping, idx) => {
                  const isHighlighted = mapping.status === 'highlight';
                  const isDismissed = mapping.status === 'dismissed';
                  const isMapped = mapping.status === 'mapped' || (mapping.universal_fields?.length > 0);
                  return (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                      backgroundColor: isHighlighted ? 'rgba(234,179,8,0.08)' : isDismissed ? '#27272a' : isMapped ? 'rgba(34,197,94,0.06)' : '#27272a',
                      borderRadius: '8px',
                      border: isHighlighted ? '1px solid rgba(234,179,8,0.3)' : isMapped ? '1px solid rgba(34,197,94,0.2)' : '1px solid transparent',
                      opacity: isDismissed ? 0.5 : 1
                    }}>
                      {/* Field Name */}
                      <div style={{ width: '180px', flexShrink: 0 }}>
                        <div style={{ fontWeight: '600', fontSize: '12px', fontFamily: 'monospace', color: '#e4e4e7' }}>{mapping.pdf_field}</div>
                        <div style={{ fontSize: '10px', color: '#52525b' }}>{mapping.pdf_field_type || mapping.type || 'text'}</div>
                      </div>

                      <div style={{ color: '#52525b', fontSize: '12px' }}>-&gt;</div>

                      {/* Dropdown or status display */}
                      {isHighlighted ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'inline-block', width: '14px', height: '14px', backgroundColor: mapping.highlight_color || '#ffff00', borderRadius: '3px', border: '1px solid rgba(255,255,255,0.2)' }}></span>
                          <span style={{ color: '#eab308', fontWeight: '500', fontSize: '13px' }}>Highlight</span>
                          {mapping.highlight_label && <span style={{ color: '#a1a1aa', fontSize: '11px' }}>"{mapping.highlight_label}"</span>}
                        </div>
                      ) : isDismissed ? (
                        <div style={{ flex: 1, color: '#71717a', fontStyle: 'italic', fontSize: '13px' }}>Dismissed</div>
                      ) : (
                        <select
                          value={mapping.universal_fields?.[0] || ''}
                          disabled={!canEditForm(mappingForm)}
                          onChange={(e) => updateFieldMapping(idx, 'universal_fields', e.target.value ? [e.target.value] : [])}
                          style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', backgroundColor: '#27272a', border: '1px solid #3f3f46', color: isMapped ? '#22c55e' : '#a1a1aa', fontSize: '12px', outline: 'none', cursor: canEditForm(mappingForm) ? 'pointer' : 'default' }}
                        >
                          <option value="">Not mapped</option>
                          {fieldContextOptions.map(group => (
                            <optgroup key={group.group} label={group.group}>
                              {group.fields.map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )}

                      {/* Status badge */}
                      <span style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', flexShrink: 0,
                        backgroundColor: isMapped ? '#22c55e20' : isHighlighted ? '#eab30820' : isDismissed ? '#3f3f46' : '#3f3f46',
                        color: isMapped ? '#22c55e' : isHighlighted ? '#eab308' : isDismissed ? '#71717a' : '#71717a'
                      }}>
                        {isMapped ? 'Mapped' : isHighlighted ? 'Highlight' : isDismissed ? 'Dismissed' : 'Unmapped'}
                      </span>

                      {/* Action buttons */}
                      {canEditForm(mappingForm) && (
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => updateFieldMapping(idx, 'status', isHighlighted ? 'unmapped' : 'highlight')}
                          style={{
                            padding: '4px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '11px',
                            backgroundColor: isHighlighted ? '#eab308' : '#3f3f46',
                            color: isHighlighted ? '#000' : '#a1a1aa'
                          }}
                          title="Mark for manual entry (yellow highlight on printed form)"
                        >
                          HL
                        </button>
                        <button
                          onClick={() => updateFieldMapping(idx, 'status', isDismissed ? 'unmapped' : 'dismissed')}
                          style={{
                            padding: '4px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '11px',
                            backgroundColor: isDismissed ? '#ef4444' : '#3f3f46',
                            color: isDismissed ? '#fff' : '#a1a1aa'
                          }}
                          title="Ignore this field"
                        >
                          X
                        </button>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(!mappingForm.field_mappings || mappingForm.field_mappings.length === 0) && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                  No fillable fields found on this form yet.
                  {canEditForm(mappingForm) && ' Click Auto-Map to read the PDF and find them.'}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#a1a1aa', fontSize: '13px' }}>
                <span style={{ color: '#22c55e' }}>{(mappingForm.field_mappings || []).filter(m => m.status === 'mapped').length} mapped</span>
                {(mappingForm.field_mappings || []).filter(m => m.status === 'highlight').length > 0 && (
                  <span style={{ color: '#eab308' }}> / {(mappingForm.field_mappings || []).filter(m => m.status === 'highlight').length} highlight</span>
                )}
                {(mappingForm.field_mappings || []).filter(m => m.status === 'dismissed').length > 0 && (
                  <span style={{ color: '#71717a' }}> / {(mappingForm.field_mappings || []).filter(m => m.status === 'dismissed').length} dismissed</span>
                )}
                {' / '}{mappingForm.field_mappings?.length || 0} total
              </div>
              {canEditForm(mappingForm) ? (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setMappingForm(null)} style={btnSecondary}>Cancel</button>
                  <button
                    onClick={analyzeFields}
                    disabled={analyzing}
                    title="Read the PDF and guess which deal detail goes in each blank"
                    style={{ ...btnPrimary, backgroundColor: '#8b5cf6', opacity: analyzing ? 0.6 : 1 }}
                  >
                    {analyzing ? 'Analyzing...' : 'Auto-Map'}
                  </button>
                  <button onClick={saveMappings} style={{ ...btnPrimary, backgroundColor: '#f97316' }}>Save Mappings</button>
                </div>
              ) : (
                <button onClick={() => setMappingForm(null)} style={btnSecondary}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === SETTINGS MODAL === */}
      {settingsModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '500px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Package Settings</h2>
                <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '13px' }}>
                  Customize deal types for your dealership
                </p>
              </div>
              <button onClick={() => setSettingsModal(false)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {/* Default Deal Types */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#a1a1aa', marginBottom: '12px' }}>Default Deal Types</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {defaultDealTypes.map(type => (
                    <span key={type} style={{
                      padding: '8px 16px', borderRadius: '6px',
                      backgroundColor: dealTypeColors[type] || '#3f3f46',
                      color: '#fff', fontSize: '13px', fontWeight: '600'
                    }}>
                      {type}
                    </span>
                  ))}
                </div>
                <p style={{ color: '#71717a', fontSize: '12px', marginTop: '8px' }}>
                  These are the standard deal types and cannot be removed.
                </p>
              </div>

              {/* Custom Deal Types */}
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#a1a1aa', marginBottom: '12px' }}>Custom Deal Types</h4>

                {customDealTypes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {customDealTypes.map(type => (
                      <div key={type} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 16px', backgroundColor: '#27272a', borderRadius: '6px'
                      }}>
                        <span style={{ fontWeight: '600' }}>{type}</span>
                        <button
                          onClick={() => removeCustomDealType(type)}
                          style={{
                            background: 'none', border: 'none', color: '#ef4444',
                            cursor: 'pointer', fontSize: '14px', padding: '4px 8px'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#71717a', fontSize: '13px', marginBottom: '16px' }}>
                    No custom deal types added yet.
                  </p>
                )}

                {/* Add New Deal Type */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newDealType}
                    onChange={(e) => setNewDealType(e.target.value)}
                    placeholder="e.g., Trade-In, Lease, Fleet"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomDealType()}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: '6px',
                      backgroundColor: '#27272a', border: '1px solid #3f3f46',
                      color: '#fff', fontSize: '14px', outline: 'none'
                    }}
                  />
                  <button
                    onClick={addCustomDealType}
                    style={{ ...btnPrimary, padding: '10px 16px' }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setSettingsModal(false)} style={btnPrimary}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* === UPLOAD CUSTOM FORM MODAL === */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '480px', width: '100%', border: '1px solid #27272a' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Upload Custom Form</h2>
                <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '13px' }}>Add your own PDF forms to generate with deals</p>
              </div>
              <button onClick={() => { setShowUploadModal(false); setUploadForm({ form_name: '', form_number: '', category: 'custom' }); }} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>x</button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', fontWeight: '500', marginBottom: '6px' }}>Form Name *</label>
                <input
                  type="text"
                  value={uploadForm.form_name}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, form_name: e.target.value }))}
                  placeholder="e.g., Dealer Addendum"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', backgroundColor: '#27272a', border: '1px solid #3f3f46', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', fontWeight: '500', marginBottom: '6px' }}>Form Number (optional)</label>
                  <input
                    type="text"
                    value={uploadForm.form_number}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, form_number: e.target.value }))}
                    placeholder="e.g., DA-001"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', backgroundColor: '#27272a', border: '1px solid #3f3f46', color: '#fff', fontSize: '14px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', fontWeight: '500', marginBottom: '6px' }}>Category</label>
                  <select
                    value={uploadForm.category}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, category: e.target.value }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '6px', backgroundColor: '#27272a', border: '1px solid #3f3f46', color: '#fff', fontSize: '14px', outline: 'none' }}
                  >
                    <option value="custom">Custom</option>
                    <option value="deal">Deal</option>
                    <option value="compliance">Compliance</option>
                    <option value="financing">Financing</option>
                    <option value="disclosure">Disclosure</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', fontWeight: '500', marginBottom: '6px' }}>PDF File *</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleCustomFormUpload}
                  disabled={uploadingForm || !uploadForm.form_name}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#27272a', border: '1px solid #3f3f46', color: '#a1a1aa', fontSize: '13px' }}
                />
                {!uploadForm.form_name && (
                  <p style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>Enter a form name first</p>
                )}
              </div>

              {uploadingForm && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', padding: '12px', backgroundColor: '#f59e0b15', borderRadius: '6px' }}>
                  Uploading and analyzing form...
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowUploadModal(false); setUploadForm({ form_name: '', form_number: '', category: 'custom' }); }}
                style={btnSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px',
          backgroundColor: toast.type === 'error' ? '#ef4444' : '#22c55e',
          padding: '12px 20px', borderRadius: '8px', color: '#fff', fontWeight: '500', zIndex: 200
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
