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

  // UI State
  const [activeTab, setActiveTab] = useState('forms');
  const [editingPackage, setEditingPackage] = useState(null);
  const [selectedForms, setSelectedForms] = useState([]);
  const [formFilter, setFormFilter] = useState('all');
  const [analyzingFormId, setAnalyzingFormId] = useState(null);
  const [mapperModal, setMapperModal] = useState(null);
  const [discovering, setDiscovering] = useState(false);

  const dealTypes = ['Cash', 'BHPH', 'Financing', 'Wholesale', 'Trade-In'];
  const dealTypeColors = {
    Cash: '#22c55e',
    BHPH: '#8b5cf6',
    Financing: '#3b82f6',
    Wholesale: '#eab308',
    'Trade-In': '#f97316'
  };

  const categoryColors = {
    deal: '#22c55e',
    title: '#3b82f6',
    financing: '#8b5cf6',
    tax: '#ef4444',
    disclosure: '#ec4899',
    registration: '#06b6d4',
    compliance: '#f97316',
    other: '#71717a'
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, [dealer?.state, dealerId]);

  const loadData = async () => {
    setLoading(true);
    const state = dealer?.state || 'UT';

    try {
      // Load forms from form_library for dealer's state
      // form_library contains production-ready forms (promoted from staging)
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

    } catch (err) {
      console.error('[DocumentRules] Load error:', err);
      showToast('Failed to load data: ' + err.message, 'error');
    }

    setLoading(false);
  };

  // === DISCOVER FORMS (triggers AI discovery, adds to form_staging) ===
  const discoverForms = async () => {
    const state = dealer?.state || 'UT';
    setDiscovering(true);
    showToast(`Discovering ${state} forms with AI...`);

    try {
      const { data, error } = await supabase.functions.invoke('discover-state-forms', {
        body: { state }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const count = data.forms_count || data.forms_found || 0;

      if (data.source === 'existing') {
        showToast(`Found ${count} existing forms in staging for ${state}. Use Admin Console to promote to library.`);
      } else {
        showToast(`Discovered ${count} forms for ${state}! Ask admin to review & promote.`);
      }

      // Note: This adds to form_staging, not form_library
      // Admin must promote forms to form_library for them to show here
      loadData();
    } catch (err) {
      console.error('[DocumentRules] Discovery error:', err);
      showToast('Discovery failed: ' + err.message, 'error');
    }
    setDiscovering(false);
  };

  // === ANALYZE FORM (Extract PDF Fields) ===
  const analyzeForm = async (form) => {
    if (!form.download_url && !form.source_url && !form.storage_path) {
      showToast('No PDF available for this form', 'error');
      return;
    }

    setAnalyzingFormId(form.id);
    showToast(`Analyzing ${form.form_name}...`);

    try {
      const { data, error } = await supabase.functions.invoke('map-form-fields', {
        body: { form_id: form.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const mapped = data?.mapped_count || 0;
      const total = data?.detected_fields_count || 0;
      showToast(`Found ${total} fields, ${mapped} auto-mapped`);
      loadData();
    } catch (err) {
      showToast('Analysis failed: ' + err.message, 'error');
    }
    setAnalyzingFormId(null);
  };

  // === UPLOAD PDF ===
  const uploadPdf = async (form, file) => {
    if (!file) return;

    showToast('Uploading PDF...');

    try {
      const state = dealer?.state || 'UT';
      const safeFormName = form.form_name.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${state}/${safeFormName}_${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('form-pdfs')
        .upload(fileName, file, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('form-pdfs').getPublicUrl(fileName);

      // Update form_library with the new URL
      await supabase
        .from('form_library')
        .update({ download_url: urlData.publicUrl })
        .eq('id', form.id);

      showToast('PDF uploaded successfully');
      loadData();
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'error');
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
  const getFormById = (id) => forms.find(f => f.id === id);

  const formsByCategory = forms.reduce((acc, form) => {
    const cat = form.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(form);
    return acc;
  }, {});

  const sortedCategories = ['deal', 'title', 'financing', 'tax', 'disclosure', 'registration', 'compliance', 'other']
    .filter(cat => formsByCategory[cat]);

  const getFilteredForms = () => {
    if (formFilter === 'all') return forms;
    if (formFilter === 'mapped') return forms.filter(f => f.mapping_confidence >= 70);
    if (formFilter === 'unmapped') return forms.filter(f => !f.detected_fields?.length);
    return forms.filter(f => f.category === formFilter);
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
              {dealer?.state || 'UT'} • {forms.length} forms • {packages.length} packages configured
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={discoverForms}
              disabled={discovering}
              style={{ ...btnPrimary, opacity: discovering ? 0.7 : 1 }}
            >
              {discovering ? 'Discovering...' : `Discover ${dealer?.state || 'UT'} Forms`}
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
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>With PDF</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{forms.filter(f => f.download_url || f.storage_path).length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Mapped</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{forms.filter(f => f.mapping_confidence >= 70).length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Packages</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#8b5cf6' }}>{packages.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #3f3f46', paddingBottom: '4px' }}>
          {[
            { id: 'forms', label: 'Form Library', count: forms.length },
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
              {['all', 'mapped', 'unmapped'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setFormFilter(filter)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
                    backgroundColor: formFilter === filter ? '#f97316' : '#3f3f46',
                    color: '#fff', textTransform: 'capitalize'
                  }}
                >
                  {filter}
                </button>
              ))}
            </div>

            {forms.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '60px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                <h3 style={{ margin: '0 0 8px 0' }}>No Forms in Library</h3>
                <p style={{ color: '#71717a', margin: '0 0 20px 0' }}>
                  Forms must be discovered and promoted by admin to appear here.
                </p>
                <button onClick={discoverForms} style={btnPrimary}>Discover Forms</button>
              </div>
            ) : (
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#71717a' }}>Form Name</th>
                      <th style={{ textAlign: 'left', padding: '12px 8px', color: '#71717a' }}>Category</th>
                      <th style={{ textAlign: 'center', padding: '12px 8px', color: '#71717a' }}>Fields</th>
                      <th style={{ textAlign: 'center', padding: '12px 8px', color: '#71717a' }}>Mapping</th>
                      <th style={{ textAlign: 'center', padding: '12px 8px', color: '#71717a' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredForms().map(form => {
                      const hasPdf = form.download_url || form.storage_path;
                      const fieldsCount = form.detected_fields?.length || 0;
                      const confidence = form.mapping_confidence || 0;

                      return (
                        <tr key={form.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: '600' }}>{form.form_name}</div>
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
                              <span style={{ color: '#22c55e', fontWeight: '600' }}>{fieldsCount}</span>
                            ) : (
                              <span style={{ color: '#52525b' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            {fieldsCount > 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                <div style={{ width: '50px', height: '6px', backgroundColor: '#3f3f46', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${confidence}%`, height: '100%', backgroundColor: confidence >= 70 ? '#22c55e' : confidence >= 40 ? '#eab308' : '#ef4444' }} />
                                </div>
                                <span style={{ fontSize: '11px', color: confidence >= 70 ? '#22c55e' : '#a1a1aa' }}>{confidence}%</span>
                              </div>
                            ) : (
                              <span style={{ color: '#52525b' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              {/* Upload PDF */}
                              <label style={{
                                padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                                backgroundColor: hasPdf ? '#22c55e20' : '#3f3f46',
                                color: hasPdf ? '#22c55e' : '#a1a1aa',
                                border: hasPdf ? '1px solid #22c55e40' : '1px solid transparent'
                              }}>
                                {hasPdf ? '✓ PDF' : 'Upload'}
                                <input
                                  type="file"
                                  accept=".pdf"
                                  style={{ display: 'none' }}
                                  onChange={(e) => uploadPdf(form, e.target.files[0])}
                                />
                              </label>

                              {/* Analyze */}
                              <button
                                onClick={() => analyzeForm(form)}
                                disabled={!hasPdf || analyzingFormId === form.id}
                                style={{
                                  padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: hasPdf ? 'pointer' : 'not-allowed',
                                  backgroundColor: '#3b82f6', color: '#fff', border: 'none',
                                  opacity: (!hasPdf || analyzingFormId === form.id) ? 0.5 : 1
                                }}
                              >
                                {analyzingFormId === form.id ? '...' : 'Analyze'}
                              </button>

                              {/* View Mappings */}
                              {fieldsCount > 0 && (
                                <button
                                  onClick={() => setMapperModal(form)}
                                  style={{
                                    padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                                    backgroundColor: '#8b5cf6', color: '#fff', border: 'none'
                                  }}
                                >
                                  Map
                                </button>
                              )}
                            </div>
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
                return (
                  <div key={dealType} style={{ ...cardStyle, borderLeft: `4px solid ${dealTypeColors[dealType]}`, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>{dealType}</h3>
                      <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                        backgroundColor: pkgForms.length > 0 ? `${dealTypeColors[dealType]}20` : '#3f3f46',
                        color: pkgForms.length > 0 ? dealTypeColors[dealType] : '#71717a'
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
                        backgroundColor: dealTypeColors[dealType], color: '#fff', fontWeight: '600',
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
                  <span style={{ color: dealTypeColors[editingPackage] }}>{editingPackage}</span> Package
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
                          backgroundColor: isSelected ? `${dealTypeColors[editingPackage]}15` : '#27272a',
                          borderRadius: '8px', marginBottom: '8px', cursor: 'pointer',
                          border: isSelected ? `2px solid ${dealTypeColors[editingPackage]}` : '2px solid transparent'
                        }}
                      >
                        <div style={{
                          width: '24px', height: '24px', borderRadius: '6px',
                          backgroundColor: isSelected ? dealTypeColors[editingPackage] : '#3f3f46',
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
                  No forms available. Ask admin to promote forms to the library.
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#a1a1aa', fontSize: '13px' }}>{selectedForms.length} documents selected</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setEditingPackage(null); setSelectedForms([]); }} style={btnSecondary}>Cancel</button>
                <button onClick={savePackage} style={{ ...btnSuccess, backgroundColor: dealTypeColors[editingPackage] }}>Save Package</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === FIELD MAPPER MODAL === */}
      {mapperModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '800px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Field Mappings</h2>
                <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '13px' }}>
                  {mapperModal.form_name} • {mapperModal.detected_fields?.length || 0} fields detected
                </p>
              </div>
              <button onClick={() => setMapperModal(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                {(mapperModal.field_mappings || []).map((mapping, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                    backgroundColor: mapping.universal_field ? '#22c55e10' : '#27272a',
                    borderRadius: '8px', border: mapping.universal_field ? '1px solid #22c55e30' : '1px solid transparent'
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
                      {mapping.universal_field ? (
                        <div style={{ color: '#22c55e', fontWeight: '500' }}>
                          {mapping.universal_field}
                          <span style={{ marginLeft: '8px', fontSize: '10px', color: '#71717a' }}>
                            ({Math.round((mapping.confidence || 0) * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <div style={{ color: '#71717a', fontStyle: 'italic' }}>Not mapped</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {(!mapperModal.field_mappings || mapperModal.field_mappings.length === 0) && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                  No field mappings. Click "Analyze" to extract PDF fields.
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#a1a1aa', fontSize: '13px' }}>
                {(mapperModal.field_mappings || []).filter(m => m.universal_field).length} / {mapperModal.field_mappings?.length || 0} fields mapped
              </div>
              <button onClick={() => setMapperModal(null)} style={btnPrimary}>Close</button>
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
