import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function DocumentRulesPage() {
  const { dealerId, dealer } = useStore();
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Data
  const [libraryForms, setLibraryForms] = useState([]);
  const [complianceRules, setComplianceRules] = useState([]);
  const [packages, setPackages] = useState([]);
  const [automationRules, setAutomationRules] = useState([]);

  // UI State
  const [activeTab, setActiveTab] = useState('packages');
  const [editingPackage, setEditingPackage] = useState(null);
  const [selectedForms, setSelectedForms] = useState([]);
  const [automationModal, setAutomationModal] = useState(null);
  const [formFilter, setFormFilter] = useState('all');

  const dealTypes = ['Cash', 'BHPH', 'Financing', 'Wholesale', 'Trade-In'];
  const dealTypeColors = {
    Cash: '#22c55e',
    BHPH: '#8b5cf6',
    Financing: '#3b82f6',
    Wholesale: '#eab308',
    'Trade-In': '#f97316'
  };

  const categoryColors = {
    title: '#8b5cf6',
    deal: '#3b82f6',
    compliance: '#ef4444',
    financing: '#22c55e',
    tax: '#f97316',
    disclosure: '#ec4899',
    registration: '#06b6d4',
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (dealerId) loadData();
  }, [dealer?.state, dealerId]);

  const loadData = async () => {
    setLoading(true);
    const state = dealer?.state || 'UT';
    const county = dealer?.county || null;

    try {
      // Library = approved forms from form_staging (new simplified architecture)
      let formsQuery = supabase
        .from('form_staging')
        .select('*')
        .eq('state', state)
        .eq('status', 'approved')
        .order('doc_type, form_number');

      const [formsRes, rulesRes, pkgsRes, autoRes] = await Promise.all([
        formsQuery,
        supabase.from('compliance_rules').select('*').eq('state', state).order('deadline_days'),
        supabase.from('document_packages').select('*').eq('dealer_id', dealerId).order('deal_type'),
        supabase.from('dealer_automation_rules').select('*').eq('dealer_id', dealerId).order('created_at'),
      ]);

      setLibraryForms(formsRes.data || []);
      setComplianceRules(rulesRes.data || []);
      setPackages(pkgsRes.data || []);
      setAutomationRules(autoRes.data || []);
    } catch (err) {
      console.error('Load error:', err);
      showToast('Failed to load data', 'error');
    }
    setLoading(false);
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

  // === AUTOMATION FUNCTIONS ===
  const saveAutomationRule = async () => {
    if (!automationModal) return;
    try {
      const ruleData = {
        dealer_id: dealerId,
        rule_type: automationModal.rule_type,
        trigger_event: automationModal.trigger_event,
        action_type: automationModal.action_type,
        config: {
          deal_types: automationModal.deal_types || [],
          reminder_days: automationModal.reminder_days || 0,
          form_ids: automationModal.form_ids || [],
          compliance_rule_id: automationModal.compliance_rule_id || null,
        },
        is_enabled: automationModal.is_enabled ?? true,
        updated_at: new Date().toISOString()
      };

      if (automationModal.id) {
        await supabase.from('dealer_automation_rules').update(ruleData).eq('id', automationModal.id);
        showToast('Automation rule updated');
      } else {
        await supabase.from('dealer_automation_rules').insert(ruleData);
        showToast('Automation rule created');
      }
      setAutomationModal(null);
      loadData();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  };

  const toggleAutomation = async (rule) => {
    try {
      await supabase.from('dealer_automation_rules')
        .update({ is_enabled: !rule.is_enabled })
        .eq('id', rule.id);
      showToast(rule.is_enabled ? 'Automation disabled' : 'Automation enabled');
      loadData();
    } catch (err) {
      showToast('Failed to toggle: ' + err.message, 'error');
    }
  };

  const deleteAutomation = async (id) => {
    if (!confirm('Delete this automation rule?')) return;
    try {
      await supabase.from('dealer_automation_rules').delete().eq('id', id);
      showToast('Automation deleted');
      loadData();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

  // === HELPERS ===
  // Group forms by doc_type (new architecture uses doc_type not category)
  const formsByDocType = libraryForms.reduce((acc, form) => {
    const docType = form.doc_type || 'deal';
    if (!acc[docType]) acc[docType] = [];
    acc[docType].push(form);
    return acc;
  }, {});

  const docTypeOrder = ['deal', 'finance', 'licensing', 'tax', 'reporting', 'other'];
  const sortedDocTypes = docTypeOrder.filter(t => formsByDocType[t]);

  const docTypeColors = { deal: '#22c55e', finance: '#3b82f6', licensing: '#f97316', tax: '#ef4444', reporting: '#8b5cf6', other: '#71717a' };
  const docTypeLabels = { deal: 'Deal Docs', finance: 'Finance Docs', licensing: 'Licensing', tax: 'Tax Docs', reporting: 'Reporting', other: 'Other' };

  // Legacy - keep for backward compat
  const formsByCategory = formsByDocType;
  const categoryOrder = docTypeOrder;
  const sortedCategories = sortedDocTypes;

  const getFormById = (id) => libraryForms.find(f => f.id === id);
  const getFormByNumber = (num) => libraryForms.find(f => f.form_number === num);

  const getFilteredForms = () => {
    if (formFilter === 'all') return libraryForms;
    // mapping_confidence is stored as decimal (0.0-1.0) now
    if (formFilter === 'mapped') return libraryForms.filter(f => {
      const conf = f.mapping_confidence || 0;
      return conf >= 0.90 || conf >= 90; // handle both formats
    });
    if (formFilter === 'unmapped') return libraryForms.filter(f => {
      const conf = f.mapping_confidence || 0;
      return conf < 0.90 && conf < 90; // handle both formats
    });
    return libraryForms.filter(f => f.doc_type === formFilter);
  };

  const getAutomationDescription = (rule) => {
    const triggers = {
      'deal_close': 'When a deal is closed',
      'deal_create': 'When a deal is created',
      'deadline_approaching': 'Days before deadline',
    };
    const actions = {
      'generate_docs': 'Generate documents',
      'send_reminder': 'Send reminder notification',
      'create_task': 'Create task',
    };
    return `${triggers[rule.trigger_event] || rule.trigger_event} → ${actions[rule.action_type] || rule.action_type}`;
  };

  // Styles
  const btnPrimary = { backgroundColor: '#3b82f6', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const btnSecondary = { backgroundColor: '#3f3f46', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', cursor: 'pointer' };
  const btnSuccess = { backgroundColor: '#22c55e', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const btnDanger = { backgroundColor: '#ef4444', border: 'none', padding: '10px 20px', borderRadius: '6px', color: '#fff', fontWeight: '600', cursor: 'pointer' };
  const cardStyle = { backgroundColor: '#27272a', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
  const inputStyle = { backgroundColor: '#3f3f46', color: '#fff', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%' };

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
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px 0' }}>Document Rules</h1>
          <p style={{ color: '#a1a1aa', margin: 0 }}>
            {dealer?.state || 'UT'} {dealer?.county ? `• ${dealer.county} County` : ''} • {libraryForms.length} forms available • {packages.length} packages
          </p>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Forms in Library</div>
            <div style={{ fontSize: '28px', fontWeight: '700' }}>{libraryForms.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Ready to Use</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{libraryForms.filter(f => (f.mapping_confidence || 0) >= 0.90).length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>With Deadlines</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>{libraryForms.filter(f => f.has_deadline || f.cadence).length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '4px' }}>Automations</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{automationRules.filter(r => r.is_enabled).length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #3f3f46', paddingBottom: '4px' }}>
          {[
            { id: 'packages', label: 'Doc Packages', count: packages.length },
            { id: 'forms', label: 'Form Library', count: libraryForms.length },
            { id: 'deadlines', label: 'Rules & Deadlines', count: libraryForms.filter(f => f.has_deadline || f.cadence).length },
            { id: 'automation', label: 'Automation', count: automationRules.length },
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
                const forms = formIds.map(id => getFormById(id)).filter(Boolean);
                return (
                  <div key={dealType} style={{ ...cardStyle, borderLeft: `4px solid ${dealTypeColors[dealType]}`, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>{dealType}</h3>
                      <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
                        backgroundColor: forms.length > 0 ? `${dealTypeColors[dealType]}20` : '#3f3f46',
                        color: forms.length > 0 ? dealTypeColors[dealType] : '#71717a'
                      }}>
                        {forms.length} docs
                      </span>
                    </div>
                    {forms.length > 0 ? (
                      <div style={{ marginBottom: '12px' }}>
                        {forms.slice(0, 4).map((form, i) => (
                          <div key={i} style={{ fontSize: '13px', color: '#a1a1aa', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#22c55e', fontFamily: 'monospace', fontSize: '11px' }}>{form.form_number}</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.form_name}</span>
                            {(form.mapping_confidence || 0) >= 99 && <span style={{ fontSize: '10px', color: '#22c55e' }}>✓</span>}
                          </div>
                        ))}
                        {forms.length > 4 && (
                          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>+{forms.length - 4} more</div>
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
                      {forms.length > 0 ? 'Edit Package' : 'Configure'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === FORMS TAB === */}
        {activeTab === 'forms' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={{ color: '#71717a', margin: 0 }}>
                Forms in your library for {dealer?.state || 'UT'}. Green checkmark = ready for auto-fill.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['all', 'mapped', 'unmapped'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setFormFilter(filter)}
                    style={{
                      padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
                      backgroundColor: formFilter === filter ? '#f97316' : '#3f3f46',
                      color: '#fff', textTransform: 'capitalize'
                    }}
                  >
                    {filter === 'mapped' ? 'Ready' : filter === 'unmapped' ? 'Needs Setup' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {libraryForms.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '60px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                <h3 style={{ margin: '0 0 8px 0' }}>No Forms in Library</h3>
                <p style={{ color: '#71717a', margin: 0 }}>
                  Promote forms from the Dev Console to add them to your library for {dealer?.state || 'UT'}.
                </p>
              </div>
            ) : (
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Form #</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Type</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Mapping</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Deadline</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>In Packages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredForms().map(form => {
                      const inPackages = packages.filter(p => p.form_ids?.includes(form.id)).map(p => p.deal_type);
                      // mapping_confidence is stored as decimal (0.0-1.0) now
                      const confidence = form.mapping_confidence || 0;
                      const confidencePercent = confidence > 1 ? confidence : Math.round(confidence * 100);
                      return (
                        <tr key={form.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: '600', color: '#22c55e' }}>
                            {form.form_number}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <div>{form.form_name}</div>
                            {form.compliance_notes && <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{form.compliance_notes.substring(0, 60)}...</div>}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: docTypeColors[form.doc_type] || '#3f3f46', color: '#fff', textTransform: 'uppercase' }}>
                              {form.doc_type || 'deal'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <div style={{ width: '50px', height: '6px', backgroundColor: '#3f3f46', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${confidencePercent}%`, height: '100%', backgroundColor: confidencePercent >= 90 ? '#22c55e' : confidencePercent >= 50 ? '#eab308' : '#ef4444' }} />
                              </div>
                              <span style={{ fontSize: '11px', color: confidencePercent >= 90 ? '#22c55e' : '#a1a1aa' }}>{confidencePercent}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            {form.has_deadline || form.cadence ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                {form.deadline_days && (
                                  <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '500' }}>
                                    {form.deadline_days}d
                                  </span>
                                )}
                                {form.cadence && (
                                  <span style={{ fontSize: '9px', color: '#3b82f6', textTransform: 'uppercase' }}>
                                    {form.cadence === 'per_transaction' ? 'Per Sale' : form.cadence}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#52525b' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            {inPackages.length > 0 ? (
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {inPackages.map(dt => (
                                  <span key={dt} style={{
                                    padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '600',
                                    backgroundColor: `${dealTypeColors[dt]}20`, color: dealTypeColors[dt]
                                  }}>
                                    {dt}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: '#52525b' }}>—</span>
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

        {/* === DEADLINES TAB === */}
        {activeTab === 'deadlines' && (() => {
          // Forms with deadlines or cadences from the library
          const formsWithDeadlines = libraryForms.filter(f => f.has_deadline || f.cadence);
          const docTypeColors = { deal: '#22c55e', finance: '#3b82f6', licensing: '#f97316', tax: '#ef4444', reporting: '#8b5cf6' };

          return (
          <div>
            <p style={{ color: '#71717a', marginBottom: '20px' }}>
              Compliance deadlines for {dealer?.state || 'UT'}. Forms with deadlines and filing cadences that require tracking.
            </p>

            {/* Forms with Deadlines Section */}
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#ef4444' }}>⏰</span> Forms with Deadlines ({formsWithDeadlines.length})
            </h3>

            {formsWithDeadlines.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', marginBottom: '24px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📄</div>
                <h4 style={{ margin: '0 0 8px 0' }}>No Forms with Deadlines</h4>
                <p style={{ color: '#71717a', margin: 0, fontSize: '13px' }}>
                  Promote forms from the Dev Console that have deadlines or cadences to see them here.
                </p>
              </div>
            ) : (
              <div style={{ ...cardStyle, marginBottom: '24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Form #</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Form Name</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Type</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Deadline</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Cadence</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Compliance Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formsWithDeadlines.map(form => (
                      <tr key={form.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                        <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontWeight: '600', color: '#22c55e' }}>
                          {form.form_number}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ fontWeight: '500' }}>{form.form_name}</div>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          {form.doc_type && (
                            <span style={{
                              padding: '2px 8px', borderRadius: '4px', fontSize: '10px',
                              backgroundColor: docTypeColors[form.doc_type] || '#3f3f46',
                              color: '#fff', textTransform: 'uppercase'
                            }}>
                              {form.doc_type}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {form.deadline_description ? (
                            <span style={{ color: '#ef4444', fontWeight: '500', fontSize: '12px' }}>
                              {form.deadline_description}
                            </span>
                          ) : form.deadline_days ? (
                            <span style={{
                              padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600',
                              backgroundColor: form.deadline_days <= 10 ? '#ef444420' : form.deadline_days <= 30 ? '#eab30820' : '#3f3f46',
                              color: form.deadline_days <= 10 ? '#ef4444' : form.deadline_days <= 30 ? '#eab308' : '#a1a1aa'
                            }}>
                              {form.deadline_days} days
                            </span>
                          ) : (
                            <span style={{ color: '#52525b' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          {form.cadence ? (
                            <span style={{
                              padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
                              backgroundColor: '#3b82f620', color: '#3b82f6', fontWeight: '500'
                            }}>
                              {form.cadence === 'per_transaction' ? 'Per Sale' :
                               form.cadence === 'monthly' ? 'Monthly' :
                               form.cadence === 'quarterly' ? 'Quarterly' :
                               form.cadence === 'annually' ? 'Annually' : form.cadence}
                            </span>
                          ) : (
                            <span style={{ color: '#52525b' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#a1a1aa', fontSize: '12px', maxWidth: '300px' }}>
                          {form.compliance_notes ? (
                            <div style={{ lineHeight: '1.4' }}>{form.compliance_notes.substring(0, 120)}{form.compliance_notes.length > 120 ? '...' : ''}</div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legacy Compliance Rules Section */}
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#eab308' }}>📋</span> Compliance Rules ({complianceRules.length})
            </h3>

            {complianceRules.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
                <h4 style={{ margin: '0 0 8px 0' }}>No Compliance Rules</h4>
                <p style={{ color: '#71717a', margin: 0, fontSize: '13px' }}>
                  No additional compliance rules have been added for {dealer?.state || 'UT'}.
                </p>
              </div>
            ) : (
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Rule</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Category</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Deadline</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Late Fee</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Agency</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Required Forms</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Automation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceRules.map(rule => {
                      const hasAutomation = automationRules.some(a => a.config?.compliance_rule_id === rule.id && a.is_enabled);
                      // Try to find matching forms from library
                      const matchingForms = libraryForms.filter(f =>
                        rule.required_forms && rule.required_forms.toLowerCase().includes(f.form_number?.toLowerCase())
                      );
                      return (
                        <tr key={rule.id} style={{ borderBottom: '1px solid #3f3f46' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ fontWeight: '600' }}>{rule.rule_name}</div>
                            {rule.description && <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>{rule.description.substring(0, 50)}...</div>}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: categoryColors[rule.category] || '#3f3f46', textTransform: 'uppercase' }}>
                              {rule.category}
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <span style={{
                              padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600',
                              backgroundColor: rule.deadline_days <= 10 ? '#ef444420' : rule.deadline_days <= 30 ? '#eab30820' : '#3f3f46',
                              color: rule.deadline_days <= 10 ? '#ef4444' : rule.deadline_days <= 30 ? '#eab308' : '#a1a1aa'
                            }}>
                              {rule.deadline_days} days
                            </span>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center', color: rule.late_fee ? '#ef4444' : '#52525b', fontWeight: rule.late_fee ? '600' : '400' }}>
                            {rule.late_fee ? `$${rule.late_fee}` : '—'}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#a1a1aa', fontSize: '12px' }}>{rule.agency || '—'}</td>
                          <td style={{ padding: '10px 8px' }}>
                            {rule.required_forms ? (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {rule.required_forms.split(',').slice(0, 3).map((f, i) => {
                                  const formMatch = libraryForms.find(lf => lf.form_number?.toLowerCase() === f.trim().toLowerCase());
                                  return (
                                    <span key={i} style={{
                                      padding: '2px 6px',
                                      backgroundColor: formMatch ? '#22c55e20' : '#3f3f46',
                                      borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace',
                                      color: formMatch ? '#22c55e' : '#a1a1aa',
                                      border: formMatch ? '1px solid #22c55e40' : 'none'
                                    }}
                                    title={formMatch ? `${formMatch.form_name} - In Library` : 'Not in Library'}
                                    >
                                      {f.trim()}
                                      {formMatch && ' ✓'}
                                    </span>
                                  );
                                })}
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            {hasAutomation ? (
                              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', backgroundColor: '#22c55e', color: '#fff' }}>ON</span>
                            ) : (
                              <button
                                onClick={() => setAutomationModal({
                                  rule_type: 'deadline_reminder',
                                  trigger_event: 'deadline_approaching',
                                  action_type: 'send_reminder',
                                  compliance_rule_id: rule.id,
                                  reminder_days: Math.max(5, Math.floor(rule.deadline_days * 0.3)),
                                  deal_types: dealTypes,
                                  is_enabled: true
                                })}
                                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px' }}
                              >
                                + Add
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })()}

        {/* === AUTOMATION TAB === */}
        {activeTab === 'automation' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={{ color: '#71717a', margin: 0 }}>
                Set up automatic document generation, reminders, and task creation.
              </p>
              <button
                onClick={() => setAutomationModal({
                  rule_type: 'doc_generation',
                  trigger_event: 'deal_close',
                  action_type: 'generate_docs',
                  deal_types: [],
                  form_ids: [],
                  reminder_days: 0,
                  is_enabled: true
                })}
                style={btnSuccess}
              >
                + New Automation
              </button>
            </div>

            {/* Quick Setup Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ ...cardStyle, borderLeft: '4px solid #22c55e', marginBottom: 0 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Auto-Generate on Close</h3>
                <p style={{ color: '#71717a', fontSize: '13px', margin: '0 0 12px 0' }}>Automatically generate all package documents when a deal is closed.</p>
                <button
                  onClick={() => setAutomationModal({
                    rule_type: 'doc_generation',
                    trigger_event: 'deal_close',
                    action_type: 'generate_docs',
                    deal_types: dealTypes,
                    is_enabled: true
                  })}
                  style={{ ...btnPrimary, backgroundColor: '#22c55e', padding: '8px 16px', fontSize: '13px' }}
                >
                  Set Up
                </button>
              </div>
              <div style={{ ...cardStyle, borderLeft: '4px solid #eab308', marginBottom: 0 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Deadline Reminders</h3>
                <p style={{ color: '#71717a', fontSize: '13px', margin: '0 0 12px 0' }}>Get notified X days before compliance deadlines.</p>
                <button
                  onClick={() => setAutomationModal({
                    rule_type: 'deadline_reminder',
                    trigger_event: 'deadline_approaching',
                    action_type: 'send_reminder',
                    reminder_days: 7,
                    deal_types: dealTypes,
                    is_enabled: true
                  })}
                  style={{ ...btnPrimary, backgroundColor: '#eab308', padding: '8px 16px', fontSize: '13px' }}
                >
                  Set Up
                </button>
              </div>
              <div style={{ ...cardStyle, borderLeft: '4px solid #71717a', marginBottom: 0, opacity: 0.7 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>Auto-Submit to Agency</h3>
                <p style={{ color: '#71717a', fontSize: '13px', margin: '0 0 12px 0' }}>Automatically submit completed forms to DMV/agencies.</p>
                <button disabled style={{ ...btnSecondary, padding: '8px 16px', fontSize: '13px', opacity: 0.5, cursor: 'not-allowed' }}>
                  Coming Soon
                </button>
              </div>
            </div>

            {/* Active Automations */}
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Active Automations ({automationRules.length})</h3>
            {automationRules.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
                <p style={{ color: '#71717a', margin: 0 }}>No automations configured yet. Use the quick setup cards above to get started.</p>
              </div>
            ) : (
              <div style={cardStyle}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3f3f46' }}>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Description</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#71717a' }}>Deal Types</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#71717a' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {automationRules.map(rule => (
                      <tr key={rule.id} style={{ borderBottom: '1px solid #3f3f46', opacity: rule.is_enabled ? 1 : 0.5 }}>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '10px', textTransform: 'uppercase',
                            backgroundColor: rule.action_type === 'generate_docs' ? '#22c55e' : rule.action_type === 'send_reminder' ? '#eab308' : '#3b82f6',
                            color: '#fff'
                          }}>
                            {rule.action_type?.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>{getAutomationDescription(rule)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {(rule.config?.deal_types || []).slice(0, 3).map(dt => (
                              <span key={dt} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '9px', backgroundColor: `${dealTypeColors[dt]}20`, color: dealTypeColors[dt] }}>
                                {dt}
                              </span>
                            ))}
                            {(rule.config?.deal_types?.length || 0) > 3 && (
                              <span style={{ color: '#71717a', fontSize: '10px' }}>+{rule.config.deal_types.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '10px',
                            backgroundColor: rule.is_enabled ? '#22c55e' : '#ef4444',
                            color: '#fff'
                          }}>
                            {rule.is_enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button onClick={() => toggleAutomation(rule)} style={{ background: 'none', border: 'none', color: rule.is_enabled ? '#ef4444' : '#22c55e', cursor: 'pointer', fontSize: '11px', marginRight: '8px' }}>
                            {rule.is_enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => setAutomationModal({ ...rule, ...rule.config })} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '11px', marginRight: '8px' }}>Edit</button>
                          <button onClick={() => deleteAutomation(rule.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* === PACKAGE EDITOR MODAL === */}
      {editingPackage && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '12px', maxWidth: '700px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #27272a' }}>
            {/* Header */}
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

            {/* Form List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {sortedDocTypes.map(docType => (
                <div key={docType} style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: '600', color: '#71717a', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: docTypeColors[docType] || '#3f3f46' }} />
                    {docTypeLabels[docType] || docType} ({formsByDocType[docType].length})
                  </h4>
                  {formsByDocType[docType].map(form => {
                    const isSelected = selectedForms.includes(form.id);
                    const confidence = form.mapping_confidence || 0;
                    const confidencePercent = confidence > 1 ? confidence : Math.round(confidence * 100);
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
                            <span style={{ color: '#22c55e', fontFamily: 'monospace' }}>{form.form_number}</span>
                            {form.form_name}
                            {confidencePercent >= 90 && <span style={{ fontSize: '10px', color: '#22c55e', padding: '1px 4px', backgroundColor: '#22c55e20', borderRadius: '3px' }}>Ready</span>}
                            {(form.has_deadline || form.cadence) && <span style={{ fontSize: '10px', color: '#ef4444', padding: '1px 4px', backgroundColor: '#ef444420', borderRadius: '3px' }}>Deadline</span>}
                          </div>
                          {form.compliance_notes && <div style={{ color: '#71717a', fontSize: '12px', marginTop: '2px' }}>{form.compliance_notes.substring(0, 60)}...</div>}
                        </div>
                        <div style={{ width: '40px', height: '4px', backgroundColor: '#3f3f46', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${confidencePercent}%`, height: '100%', backgroundColor: confidencePercent >= 90 ? '#22c55e' : '#eab308' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {libraryForms.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                  No forms available. Promote forms from the Dev Console.
                </div>
              )}
            </div>

            {/* Footer */}
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

      {/* === AUTOMATION MODAL === */}
      {automationModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: '#27272a', borderRadius: '12px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #3f3f46' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>{automationModal.id ? 'Edit' : 'New'} Automation Rule</h3>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Trigger */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}>When this happens (Trigger)</label>
                <select
                  value={automationModal.trigger_event || 'deal_close'}
                  onChange={(e) => setAutomationModal({ ...automationModal, trigger_event: e.target.value })}
                  style={inputStyle}
                >
                  <option value="deal_close">Deal is closed</option>
                  <option value="deal_create">Deal is created</option>
                  <option value="deadline_approaching">Deadline is approaching</option>
                </select>
              </div>

              {/* Action */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}>Do this (Action)</label>
                <select
                  value={automationModal.action_type || 'generate_docs'}
                  onChange={(e) => setAutomationModal({ ...automationModal, action_type: e.target.value })}
                  style={inputStyle}
                >
                  <option value="generate_docs">Generate documents from package</option>
                  <option value="send_reminder">Send reminder notification</option>
                  <option value="create_task">Create a task</option>
                </select>
              </div>

              {/* Reminder Days (if deadline trigger) */}
              {automationModal.trigger_event === 'deadline_approaching' && (
                <div>
                  <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}>Days before deadline</label>
                  <input
                    type="number"
                    value={automationModal.reminder_days || 7}
                    onChange={(e) => setAutomationModal({ ...automationModal, reminder_days: parseInt(e.target.value) || 0 })}
                    style={inputStyle}
                    min={1}
                    max={60}
                  />
                </div>
              )}

              {/* Deal Types */}
              <div>
                <label style={{ display: 'block', color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}>Apply to deal types</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {dealTypes.map(dt => {
                    const isSelected = automationModal.deal_types?.includes(dt);
                    return (
                      <button
                        key={dt}
                        onClick={() => {
                          const current = automationModal.deal_types || [];
                          setAutomationModal({
                            ...automationModal,
                            deal_types: isSelected ? current.filter(d => d !== dt) : [...current, dt]
                          });
                        }}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
                          backgroundColor: isSelected ? dealTypeColors[dt] : '#3f3f46',
                          color: '#fff'
                        }}
                      >
                        {dt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Enabled */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '14px' }}>
                <input
                  type="checkbox"
                  checked={automationModal.is_enabled ?? true}
                  onChange={(e) => setAutomationModal({ ...automationModal, is_enabled: e.target.checked })}
                />
                Enable this automation
              </label>
            </div>
            <div style={{ padding: '20px', borderTop: '1px solid #3f3f46', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setAutomationModal(null)} style={btnSecondary}>Cancel</button>
              <button onClick={saveAutomationRule} style={btnSuccess}>Save</button>
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
