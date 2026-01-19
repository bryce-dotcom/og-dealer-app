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

  const toggleRule = async (ruleId, field, value) => {
    await supabase.from('document_rules').update({ [field]: value }).eq('id', ruleId);
    loadData();
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
            {dealer?.state || 'UT'} compliance • {forms.length} forms • {rules.length} active rules
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
                return (
                  <tr key={form.id || i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ color: theme.text, fontWeight: '500' }}>{form.form_number}</div>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>{form.form_name}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: cc.bg, color: cc.text, fontSize: '11px', fontWeight: '500', textTransform: 'uppercase' }}>{form.category}</span>
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
                {['Form', 'Trigger', 'Required', 'Auto-Include'].map(h => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={rule.id || i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ color: theme.text, fontWeight: '500' }}>{rule.form_registry?.form_number}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>{rule.form_registry?.form_name}</div>
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
              ))}
            </tbody>
          </table>
          {rules.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No rules configured. Discover forms first.</div>}
        </div>
      )}

      {activeTab === 'packages' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {packages.map((pkg, i) => (
            <div key={pkg.id || i} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', padding: '20px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div>
                  <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>{pkg.name}</div>
                  <div style={{ color: theme.textMuted, fontSize: '13px' }}>{pkg.description}</div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: '8px', backgroundColor: theme.border, color: theme.textSecondary, fontSize: '11px', textTransform: 'uppercase' }}>{pkg.deal_type}</span>
              </div>
              <div style={{ color: theme.textSecondary, fontSize: '13px' }}>{pkg.form_ids?.length || 0} documents</div>
            </div>
          ))}
          {packages.length === 0 && (
            <div style={{ gridColumn: 'span 2', padding: '40px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px' }}>
              No document packages yet. Packages are auto-created when forms are discovered.
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '32px', padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
        <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>How Document Rules Work</h3>
        <div style={{ color: theme.textSecondary, fontSize: '14px', lineHeight: '1.6' }}>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>1. Discovery:</strong> AI scans your state's DMV and tax requirements to find all required forms.</p>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>2. Rules:</strong> Each form gets assigned a trigger (when it's needed) and deal types it applies to.</p>
          <p style={{ marginBottom: '8px' }}><strong style={{ color: theme.accent }}>3. Auto-Include:</strong> Forms marked "Auto" are automatically added to deal packets.</p>
          <p><strong style={{ color: theme.accent }}>4. Deadlines:</strong> System tracks filing deadlines and alerts you before they're due.</p>
        </div>
      </div>
    </div>
  );
}