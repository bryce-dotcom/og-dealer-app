import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function DocumentRulesPage() {
  const { dealerId, dealer } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  const [forms, setForms] = useState([]);
  const [rules, setRules] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [activeTab, setActiveTab] = useState('forms');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingPackage, setEditingPackage] = useState(null);
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [newPackage, setNewPackage] = useState({ name: '', description: '', deal_type: 'cash', form_ids: [] });

  const categories = ['deal', 'title', 'tax', 'financing', 'compliance', 'federal', 'other'];
  const dealTypes = ['cash', 'finance', 'bhph', 'trade', 'wholesale'];

  useEffect(() => { loadData(); }, [dealerId]);

  const loadData = async () => {
    if (!dealerId) return;
    setLoading(true);
    
    const [formsRes, rulesRes, packagesRes] = await Promise.all([
      supabase.from('form_registry').select('*').eq('state', dealer?.state || 'UT').order('category'),
      supabase.from('document_rules').select('*, form_registry(*)').eq('dealer_id', dealerId),
      supabase.from('document_packages').select('*').eq('dealer_id', dealerId)
    ]);

    setForms(formsRes.data || []);
    setRules(rulesRes.data || []);
    setPackages(packagesRes.data || []);
    setLoading(false);
  };

  const discoverForms = async () => {
    if (!dealer?.state) {
      alert('Set your state in Settings first');
      return;
    }
    setDiscovering(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-state-forms', {
        body: { state: dealer.state, county: dealer.county, dealer_id: dealerId }
      });
      if (error) throw error;
      alert(`Discovered ${data.forms_discovered} forms, added ${data.forms_added} new forms and ${data.rules_created} rules`);
      loadData();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDiscovering(false);
    }
  };

  const updateFormCategory = async (formId, newCategory) => {
    await supabase.from('form_registry').update({ category: newCategory }).eq('id', formId);
    setEditingCategory(null);
    loadData();
  };

  const toggleRule = async (ruleId, field, value) => {
    await supabase.from('document_rules').update({ [field]: value }).eq('id', ruleId);
    loadData();
  };

  const savePackage = async (pkg) => {
    if (pkg.id) {
      await supabase.from('document_packages').update({
        name: pkg.name,
        description: pkg.description,
        deal_type: pkg.deal_type,
        form_ids: pkg.form_ids
      }).eq('id', pkg.id);
    } else {
      await supabase.from('document_packages').insert({
        ...pkg,
        dealer_id: dealerId
      });
    }
    setEditingPackage(null);
    setShowNewPackage(false);
    setNewPackage({ name: '', description: '', deal_type: 'cash', form_ids: [] });
    loadData();
  };

  const deletePackage = async (pkgId) => {
    if (!confirm('Delete this package?')) return;
    await supabase.from('document_packages').delete().eq('id', pkgId);
    loadData();
  };

  const toggleFormInPackage = (formId, pkg, setPkg) => {
    const current = pkg.form_ids || [];
    if (current.includes(formId)) {
      setPkg({ ...pkg, form_ids: current.filter(id => id !== formId) });
    } else {
      setPkg({ ...pkg, form_ids: [...current, formId] });
    }
  };

  const categoryColor = (cat) => {
    switch(cat) {
      case 'deal': return { bg: '#166534', text: '#4ade80' };
      case 'title': return { bg: '#1e40af', text: '#60a5fa' };
      case 'tax': return { bg: '#9a3412', text: '#fb923c' };
      case 'financing': return { bg: '#7c3aed', text: '#c4b5fd' };
      case 'compliance': return { bg: '#0891b2', text: '#67e8f9' };
      case 'federal': return { bg: '#be123c', text: '#fda4af' };
      default: return { bg: '#3f3f46', text: '#a1a1aa' };
    }
  };

  const triggerLabel = (trigger) => {
    const labels = {
      'deal_close': 'When Deal Closes',
      'title_transfer': 'Title Transfer',
      'bhph_setup': 'BHPH Loan Setup',
      'monthly_tax': 'Monthly Tax Filing',
      'quarterly_report': 'Quarterly Report',
      'vehicle_acquisition': 'Vehicle Purchase',
      'compliance_audit': 'Compliance Audit'
    };
    return labels[trigger] || trigger;
  };

  if (loading) return <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Document Rules</h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>
            {dealer?.state || 'UT'} compliance • {forms.length} forms • {rules.length} rules • {packages.length} packages
          </p>
        </div>
        <button onClick={discoverForms} disabled={discovering} style={{ padding: '10px 20px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
          {discovering ? 'Discovering...' : 'Re-Discover Forms'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['forms', 'rules', 'packages'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: activeTab === tab ? theme.accent : theme.border, color: activeTab === tab ? '#fff' : theme.textSecondary, fontSize: '14px', cursor: 'pointer', fontWeight: '500', textTransform: 'capitalize' }}>{tab}</button>
        ))}
      </div>

      {activeTab === 'forms' && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          <div style={{ padding: '12px 16px', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ color: '#8b5cf6', fontSize: '13px' }}>💡 Click any category to change it if AI got it wrong</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.border }}>
                {['Form', 'Category', 'Trigger', 'Deal Types', 'Deadline', 'Auto'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forms.map((form, i) => {
                const cc = categoryColor(form.category);
                const isEditing = editingCategory === form.id;
                return (
                  <tr key={form.id || i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ color: theme.text, fontWeight: '500' }}>{form.form_number}</div>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>{form.form_name}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {categories.map(cat => {
                            const catColor = categoryColor(cat);
                            return (
                              <button key={cat} onClick={() => updateFormCategory(form.id, cat)} style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: form.category === cat ? catColor.bg : theme.bg, color: form.category === cat ? catColor.text : theme.textMuted, border: `1px solid ${form.category === cat ? catColor.text : theme.border}`, fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', cursor: 'pointer' }}>{cat}</button>
                            );
                          })}
                          <button onClick={() => setEditingCategory(null)} style={{ padding: '4px 8px', borderRadius: '12px', backgroundColor: 'transparent', color: theme.textMuted, border: 'none', fontSize: '14px', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingCategory(form.id)} style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: cc.bg, color: cc.text, border: 'none', fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {form.category}<span style={{ fontSize: '10px', opacity: 0.7 }}>✎</span>
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: theme.textSecondary, fontSize: '13px' }}>{triggerLabel(form.usage_trigger)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {(form.deal_type || []).map(dt => (
                          <span key={dt} style={{ padding: '2px 8px', borderRadius: '8px', backgroundColor: theme.border, color: theme.textSecondary, fontSize: '11px' }}>{dt}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', color: form.deadline_days ? theme.accent : theme.textMuted, fontSize: '13px' }}>
                      {form.deadline_description || (form.deadline_days ? `${form.deadline_days} days` : '-')}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: form.auto_generate ? '#166534' : theme.border, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: form.auto_generate ? '#4ade80' : theme.textMuted, fontSize: '12px' }}>
                        {form.auto_generate ? '✓' : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {forms.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No forms discovered. Click "Re-Discover Forms" to scan your state.</div>}
        </div>
      )}

      {activeTab === 'rules' && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.border }}>
                {['Form', 'Category', 'Trigger', 'Required', 'Auto-Include'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => {
                const cc = categoryColor(rule.form_registry?.category);
                return (
                  <tr key={rule.id || i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ color: theme.text, fontWeight: '500' }}>{rule.form_registry?.form_number}</div>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>{rule.form_registry?.form_name}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: cc.bg, color: cc.text, fontSize: '11px', fontWeight: '500', textTransform: 'uppercase' }}>{rule.form_registry?.category}</span>
                    </td>
                    <td style={{ padding: '14px 16px', color: theme.textSecondary, fontSize: '13px' }}>{triggerLabel(rule.trigger_event)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <button onClick={() => toggleRule(rule.id, 'is_required', !rule.is_required)} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: rule.is_required ? '#166534' : theme.border, color: rule.is_required ? '#4ade80' : theme.textMuted, fontSize: '12px', cursor: 'pointer' }}>
                        {rule.is_required ? 'Required' : 'Optional'}
                      </button>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <button onClick={() => toggleRule(rule.id, 'auto_include', !rule.auto_include)} style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: rule.auto_include ? '#1e40af' : theme.border, color: rule.auto_include ? '#60a5fa' : theme.textMuted, fontSize: '12px', cursor: 'pointer' }}>
                        {rule.auto_include ? 'Auto' : 'Manual'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rules.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No rules configured. Discover forms first.</div>}
        </div>
      )}

      {activeTab === 'packages' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ color: '#8b5cf6', fontSize: '13px' }}>💡 Create document packages for different deal types</div>
            <button onClick={() => setShowNewPackage(true)} style={{ padding: '10px 20px', backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ New Package</button>
          </div>

          {showNewPackage && (
            <PackageEditor
              pkg={newPackage}
              setPkg={setNewPackage}
              forms={forms}
              dealTypes={dealTypes}
              theme={theme}
              categoryColor={categoryColor}
              onSave={() => savePackage(newPackage)}
              onCancel={() => { setShowNewPackage(false); setNewPackage({ name: '', description: '', deal_type: 'cash', form_ids: [] }); }}
              toggleForm={(formId) => toggleFormInPackage(formId, newPackage, setNewPackage)}
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
            {packages.map((pkg, i) => {
              const isEditing = editingPackage?.id === pkg.id;
              if (isEditing) {
                return (
                  <PackageEditor
                    key={pkg.id}
                    pkg={editingPackage}
                    setPkg={setEditingPackage}
                    forms={forms}
                    dealTypes={dealTypes}
                    theme={theme}
                    categoryColor={categoryColor}
                    onSave={() => savePackage(editingPackage)}
                    onCancel={() => setEditingPackage(null)}
                    onDelete={() => deletePackage(pkg.id)}
                    toggleForm={(formId) => toggleFormInPackage(formId, editingPackage, setEditingPackage)}
                  />
                );
              }
              return (
                <div key={pkg.id || i} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>{pkg.name}</div>
                      <div style={{ color: theme.textMuted, fontSize: '13px' }}>{pkg.description}</div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: '8px', backgroundColor: theme.accent + '30', color: theme.accent, fontSize: '11px', textTransform: 'uppercase', fontWeight: '600' }}>{pkg.deal_type}</span>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>{pkg.form_ids?.length || 0} documents:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {(pkg.form_ids || []).slice(0, 5).map(formId => {
                        const form = forms.find(f => f.id === formId);
                        const cc = categoryColor(form?.category);
                        return form ? (
                          <span key={formId} style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: cc.bg, color: cc.text, fontSize: '10px' }}>{form.form_number}</span>
                        ) : null;
                      })}
                      {(pkg.form_ids?.length || 0) > 5 && (
                        <span style={{ padding: '2px 8px', borderRadius: '6px', backgroundColor: theme.border, color: theme.textMuted, fontSize: '10px' }}>+{pkg.form_ids.length - 5} more</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setEditingPackage({ ...pkg })} style={{ padding: '8px 16px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', cursor: 'pointer', width: '100%' }}>✎ Edit Package</button>
                </div>
              );
            })}
          </div>
          
          {packages.length === 0 && !showNewPackage && (
            <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px' }}>
              No document packages yet. Click "+ New Package" to create one.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '32px', padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
        <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>How Document Rules Work</h3>
        <div style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.6' }}>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>1. Discovery:</strong> AI scans your state's DMV and tax requirements to find all required forms.</p>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>2. Categories:</strong> AI assigns categories - click any to change if wrong.</p>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>3. Packages:</strong> Group forms into packages for different deal types.</p>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>4. Auto-Include:</strong> Forms marked "Auto" are automatically added to deals.</p>
          <p><strong style={{ color: theme.accent }}>5. Deadlines:</strong> System tracks filing deadlines and alerts you.</p>
        </div>
      </div>
    </div>
  );
}

function PackageEditor({ pkg, setPkg, forms, dealTypes, theme, categoryColor, onSave, onCancel, onDelete, toggleForm }) {
  return (
    <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `2px solid ${theme.accent}`, marginBottom: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>Package Name</label>
        <input type="text" value={pkg.name} onChange={e => setPkg({ ...pkg, name: e.target.value })} placeholder="e.g., Cash Deal Package" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '14px' }} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>Description</label>
        <input type="text" value={pkg.description} onChange={e => setPkg({ ...pkg, description: e.target.value })} placeholder="e.g., All docs needed for cash sales" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '14px' }} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>Deal Type</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {dealTypes.map(dt => (
            <button key={dt} onClick={() => setPkg({ ...pkg, deal_type: dt })} style={{ padding: '6px 14px', borderRadius: '6px', backgroundColor: pkg.deal_type === dt ? theme.accent : theme.bg, color: pkg.deal_type === dt ? '#fff' : theme.textSecondary, border: `1px solid ${pkg.deal_type === dt ? theme.accent : theme.border}`, fontSize: '13px', cursor: 'pointer', textTransform: 'uppercase' }}>{dt}</button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>Select Forms ({pkg.form_ids?.length || 0} selected)</label>
        <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: theme.bg, borderRadius: '8px', padding: '8px' }}>
          {forms.map(form => {
            const isSelected = (pkg.form_ids || []).includes(form.id);
            const cc = categoryColor(form.category);
            return (
              <div key={form.id} onClick={() => toggleForm(form.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', marginBottom: '4px', backgroundColor: isSelected ? theme.accent + '20' : 'transparent', border: `1px solid ${isSelected ? theme.accent : 'transparent'}`, cursor: 'pointer' }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: isSelected ? theme.accent : theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px' }}>{isSelected ? '✓' : ''}</span>
                <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: cc.bg, color: cc.text, fontSize: '10px' }}>{form.category}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{form.form_number}</div>
                  <div style={{ color: theme.textMuted, fontSize: '11px' }}>{form.form_name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onSave} disabled={!pkg.name} style={{ flex: 1, padding: '10px', backgroundColor: pkg.name ? '#22c55e' : theme.border, color: pkg.name ? '#fff' : theme.textMuted, border: 'none', borderRadius: '6px', fontWeight: '600', cursor: pkg.name ? 'pointer' : 'not-allowed' }}>💾 Save</button>
        <button onClick={onCancel} style={{ padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
        {onDelete && <button onClick={onDelete} style={{ padding: '10px 16px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🗑</button>}
      </div>
    </div>
  );
}