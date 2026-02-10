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
  const [mapperModal, setMapperModal] = useState(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [customDealTypes, setCustomDealTypes] = useState([]);
  const [newDealType, setNewDealType] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadingForm, setUploadingForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ form_name: '', form_number: '', category: 'custom' });

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

      // Load document packages for this dealer
      if (dealerId) {
        const { data: pkgData, error: pkgError } = await supabase
          .from('document_packages')
          .select('*')
          .eq('dealer_id', dealerId);

        if (pkgError) {
          console.error('[DocumentRules] Packages error:', pkgError);
        } else {
          setPackages(pkgData || []);
        }
      }

      // Load dealer custom forms
      if (dealerId) {
        const { data: customData, error: customError } = await supabase
          .from('dealer_custom_forms')
          .select('*')
          .eq('dealer_id', dealerId)
          .order('created_at', { ascending: false });

        if (customError) {
          console.error('[DocumentRules] Custom forms error:', customError);
        } else {
          setDealerCustomForms(customData || []);
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

  // === CUSTOM FORM FUNCTIONS ===
  const handleCustomFormUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.pdf')) {
      showToast('Please select a PDF file', 'error');
      return;
    }

    setUploadingForm(true);
    try {
      // 1. Upload to storage
      const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${dealerId}/${Date.now()}_${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('dealer-forms')
        .upload(storagePath, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // 2. Extract form fields via edge function
      const extractRes = await fetch(
        `https://rlzudfinlxonpbwacxpt.supabase.co/functions/v1/extract-pdf-fields`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsenVkZmlubHhvbnBid2FjeHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTk5MzksImV4cCI6MjA4NDE3NTkzOX0.93JAEAoYad2WStPpaZZbFAUR3cIKWF1PG5xEVmMkj4U` },
          body: JSON.stringify({ storage_bucket: 'dealer-forms', storage_path: storagePath })
        }
      );
      const extractResult = await extractRes.json();
      if (!extractResult.success) throw new Error(extractResult.error || 'Field extraction failed');

      // 3. Create database record
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
          detected_fields: extractResult.detected_fields.map(f => f.pdf_field),
          field_mappings: extractResult.detected_fields,
          is_fillable: extractResult.fields_count > 0,
          mapping_status: extractResult.fields_count > 0 ? 'unmapped' : 'no_fields'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      showToast(`Form uploaded - ${extractResult.fields_count} fillable fields detected`);
      setShowUploadModal(false);
      setUploadForm({ form_name: '', form_number: '', category: 'custom' });
      loadData();

      // Open mapping modal for the new form if it has fields
      if (extractResult.fields_count > 0 && newForm) {
        setMapperModal({ ...newForm, _isCustom: true });
      }
    } catch (err) {
      console.error('Upload error:', err);
      showToast('Upload failed: ' + err.message, 'error');
    } finally {
      setUploadingForm(false);
    }
  };

  const deleteCustomForm = async (form) => {
    if (!confirm(`Delete "${form.form_name}"? This cannot be undone.`)) return;
    try {
      // Delete from storage
      if (form.storage_path) {
        await supabase.storage.from(form.storage_bucket || 'dealer-forms').remove([form.storage_path]);
      }
      // Delete from database
      const { error } = await supabase.from('dealer_custom_forms').delete().eq('id', form.id);
      if (error) throw error;
      showToast('Custom form deleted');
      loadData();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

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

      if (existing) {
        await supabase.from('document_packages').update(packageData).eq('id', existing.id);
      } else {
        await supabase.from('document_packages').insert(packageData);
      }
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
            <p style={{ color: '#a1a1aa', margin: 0 }}>
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

                      return (
                        <tr
                          key={form.id}
                          style={{ borderBottom: '1px solid #3f3f46', cursor: fieldsCount > 0 ? 'pointer' : 'default' }}
                          onClick={() => fieldsCount > 0 && setMapperModal(form)}
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
                            {isCustom && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteCustomForm(form); }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '4px 6px' }}
                                title="Delete custom form"
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

      {/* === FIELD MAPPER MODAL (View Only) === */}
      {mapperModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '800px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Field Mappings</h2>
                <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '13px' }}>
                  {mapperModal.form_name} • {mapperModal.detected_fields?.length || 0} fields
                </p>
              </div>
              <button onClick={() => setMapperModal(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(mapperModal.field_mappings || []).map((mapping, idx) => {
                  const isHighlighted = mapping.status === 'highlight';
                  const isDismissed = mapping.status === 'dismissed';
                  const isMapped = mapping.universal_fields?.length > 0 || !!mapping.universal_field;
                  return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                    backgroundColor: isHighlighted ? 'rgba(234,179,8,0.1)' : (isMapped ? '#22c55e10' : '#27272a'),
                    borderRadius: '8px',
                    border: isHighlighted ? '1px solid rgba(234,179,8,0.3)' : (isMapped ? '1px solid #22c55e30' : '1px solid transparent'),
                    opacity: isDismissed ? 0.5 : 1
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '13px', fontFamily: 'monospace' }}>
                        {mapping.pdf_field}
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>
                        {mapping.pdf_field_type || 'text'}
                      </div>
                    </div>
                    <div style={{ color: '#52525b' }}>→</div>
                    <div style={{ flex: 1 }}>
                      {isHighlighted ? (
                        <div style={{ color: '#eab308', fontWeight: '500' }}>
                          <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: mapping.highlight_color || '#ffff00', borderRadius: '2px', marginRight: '6px', verticalAlign: 'middle' }}></span>
                          Highlight{mapping.highlight_label ? `: "${mapping.highlight_label}"` : ''}
                        </div>
                      ) : isDismissed ? (
                        <div style={{ color: '#71717a', fontStyle: 'italic', textDecoration: 'line-through' }}>Dismissed</div>
                      ) : isMapped ? (
                        <div style={{ color: '#22c55e', fontWeight: '500' }}>
                          {mapping.universal_fields?.join(', ') || mapping.universal_field}
                          <span style={{ marginLeft: '8px', fontSize: '10px', color: '#71717a' }}>
                            ({Math.round((mapping.confidence || 0) * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <div style={{ color: '#71717a', fontStyle: 'italic' }}>Not mapped</div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>

              {(!mapperModal.field_mappings || mapperModal.field_mappings.length === 0) && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                  No field mappings available for this form.
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#a1a1aa', fontSize: '13px' }}>
                {(mapperModal.field_mappings || []).filter(m => m.universal_fields?.length > 0 || m.universal_field).length} mapped
                {(mapperModal.field_mappings || []).filter(m => m.status === 'highlight').length > 0 && (
                  <span style={{ color: '#eab308' }}> / {(mapperModal.field_mappings || []).filter(m => m.status === 'highlight').length} highlight</span>
                )}
                {' / '}{mapperModal.field_mappings?.length || 0} total
              </div>
              <button onClick={() => setMapperModal(null)} style={btnPrimary}>Close</button>
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
