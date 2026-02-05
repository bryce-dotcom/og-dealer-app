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
  const [mapperModal, setMapperModal] = useState(null);
  const [settingsModal, setSettingsModal] = useState(false);
  const [customDealTypes, setCustomDealTypes] = useState([]);
  const [newDealType, setNewDealType] = useState('');

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
              {dealer?.state || 'UT'} • {forms.length} forms available • {packages.length} packages configured
            </p>
          </div>
          <button
            onClick={() => setSettingsModal(true)}
            style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '8px' }}
            title="Package Settings"
          >
            ⚙️ Settings
          </button>
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
                  {filter === 'mapped' ? 'Ready' : filter === 'unmapped' ? 'Pending' : filter}
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

                      return (
                        <tr
                          key={form.id}
                          style={{ borderBottom: '1px solid #3f3f46', cursor: fieldsCount > 0 ? 'pointer' : 'default' }}
                          onClick={() => fieldsCount > 0 && setMapperModal(form)}
                        >
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
                              <span style={{ color: '#a1a1aa' }}>{fieldsCount}</span>
                            ) : (
                              <span style={{ color: '#52525b' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center' }}>
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
                  No field mappings available for this form.
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
