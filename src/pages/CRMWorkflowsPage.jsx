import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function CRMWorkflowsPage() {
  const { theme } = useTheme();
  const { dealerId } = useStore();
  const [loading, setLoading] = useState(true);
  const [workflows, setWorkflows] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeTab, setActiveTab] = useState('workflows');
  const [showModal, setShowModal] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_type: 'new_lead',
    trigger_conditions: {},
    steps: [{ step: 1, action: 'send_sms', template: '', delay_hours: 0 }],
    active: true
  });

  const triggerTypes = {
    new_lead: { label: 'New Lead', icon: '🎯', desc: 'When a new lead is created' },
    deal_created: { label: 'Deal Created', icon: '🤝', desc: 'When a deal is started' },
    deal_lost: { label: 'Deal Lost', icon: '❌', desc: 'When a deal is lost' },
    post_sale: { label: 'Post-Sale', icon: '✅', desc: 'After a vehicle is sold' },
    payment_overdue: { label: 'Payment Overdue', icon: '💰', desc: 'When a BHPH payment is overdue' },
    birthday: { label: 'Birthday', icon: '🎂', desc: 'On customer birthday' },
    service_due: { label: 'Service Due', icon: '🔧', desc: 'When service is due' },
    no_activity: { label: 'No Activity', icon: '😴', desc: 'After period of no contact' },
    appointment_missed: { label: 'Missed Appointment', icon: '📅', desc: 'When appointment is missed' },
    custom: { label: 'Custom', icon: '⚙️', desc: 'Custom trigger conditions' }
  };

  const actionTypes = {
    send_sms: { label: 'Send SMS', icon: '💬' },
    send_email: { label: 'Send Email', icon: '📧' },
    create_task: { label: 'Create Task', icon: '📋' },
    create_notification: { label: 'Notify Staff', icon: '🔔' },
    update_lead_status: { label: 'Update Lead Status', icon: '🏷️' },
    schedule_follow_up: { label: 'Schedule Follow-up', icon: '📅' },
    log_interaction: { label: 'Log Interaction', icon: '📝' }
  };

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  async function loadData() {
    setLoading(true);
    const [{ data: wf }, { data: rn }] = await Promise.all([
      supabase.from('crm_workflows').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('crm_workflow_runs').select('*').eq('dealer_id', dealerId).order('started_at', { ascending: false }).limit(50)
    ]);
    setWorkflows(wf || []);
    setRuns(rn || []);
    setLoading(false);
  }

  function addStep() {
    const newStep = { step: form.steps.length + 1, action: 'send_sms', template: '', delay_hours: 0 };
    setForm({ ...form, steps: [...form.steps, newStep] });
  }

  function updateStep(index, field, value) {
    const steps = [...form.steps];
    steps[index] = { ...steps[index], [field]: value };
    setForm({ ...form, steps });
  }

  function removeStep(index) {
    if (form.steps.length <= 1) return;
    const steps = form.steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step: i + 1 }));
    setForm({ ...form, steps });
  }

  async function handleSave() {
    try {
      const payload = {
        dealer_id: dealerId,
        name: form.name,
        description: form.description,
        trigger_type: form.trigger_type,
        trigger_conditions: form.trigger_conditions,
        steps: form.steps,
        active: form.active
      };

      if (selectedWorkflow) {
        await supabase.from('crm_workflows').update(payload).eq('id', selectedWorkflow.id);
      } else {
        await supabase.from('crm_workflows').insert(payload);
      }
      setShowModal(false);
      setSelectedWorkflow(null);
      resetForm();
      loadData();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  }

  async function toggleActive(wf) {
    await supabase.from('crm_workflows').update({ active: !wf.active }).eq('id', wf.id);
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this workflow?')) return;
    await supabase.from('crm_workflows').delete().eq('id', id);
    loadData();
  }

  function openEdit(wf) {
    setSelectedWorkflow(wf);
    setForm({
      name: wf.name,
      description: wf.description || '',
      trigger_type: wf.trigger_type,
      trigger_conditions: wf.trigger_conditions || {},
      steps: wf.steps || [{ step: 1, action: 'send_sms', template: '', delay_hours: 0 }],
      active: wf.active
    });
    setShowModal(true);
  }

  function resetForm() {
    setForm({ name: '', description: '', trigger_type: 'new_lead', trigger_conditions: {}, steps: [{ step: 1, action: 'send_sms', template: '', delay_hours: 0 }], active: true });
  }

  function getRunStatusStyle(status) {
    const map = {
      running: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
      completed: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
      failed: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
      cancelled: { bg: 'rgba(113,113,122,0.15)', color: '#71717a' },
      paused: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
    };
    return map[status] || map.running;
  }

  const activeWorkflows = workflows.filter(w => w.active);
  const inactiveWorkflows = workflows.filter(w => !w.active);

  if (loading) {
    return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ color: theme.textSecondary }}>Loading workflows...</div>
    </div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>CRM Workflows</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Automated customer follow-ups & engagement</p>
        </div>
        <button onClick={() => { setSelectedWorkflow(null); resetForm(); setShowModal(true); }} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ New Workflow</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active Workflows', value: activeWorkflows.length, color: '#22c55e' },
          { label: 'Inactive', value: inactiveWorkflows.length, color: '#71717a' },
          { label: 'Total Runs', value: workflows.reduce((sum, w) => sum + (w.runs_count || 0), 0), color: '#3b82f6' },
          { label: 'Running Now', value: runs.filter(r => r.status === 'running').length, color: '#f59e0b' },
          { label: 'Completed', value: runs.filter(r => r.status === 'completed').length, color: '#22c55e' },
          { label: 'Failed', value: runs.filter(r => r.status === 'failed').length, color: '#ef4444' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'workflows', label: `Workflows (${workflows.length})` }, { id: 'runs', label: `Recent Runs (${runs.length})` }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', backgroundColor: activeTab === tab.id ? theme.accentBg : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent', color: activeTab === tab.id ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>{tab.label}</button>
        ))}
      </div>

      {/* Workflows Tab */}
      {activeTab === 'workflows' && (
        <>
          {workflows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤖</div>
              <p>No workflows yet. Create your first automated workflow.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {workflows.map(wf => {
                const trigger = triggerTypes[wf.trigger_type] || triggerTypes.custom;
                return (
                  <div key={wf.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
                        <span style={{ fontSize: '28px' }}>{trigger.icon}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>{wf.name}</span>
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: wf.active ? 'rgba(34,197,94,0.15)' : 'rgba(113,113,122,0.15)', color: wf.active ? '#22c55e' : '#71717a' }}>
                              {wf.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          {wf.description && <div style={{ color: theme.textMuted, fontSize: '13px', marginTop: '4px' }}>{wf.description}</div>}
                          <div style={{ color: theme.textSecondary, fontSize: '13px', marginTop: '6px' }}>
                            Trigger: <strong>{trigger.label}</strong> • {(wf.steps || []).length} steps • {wf.runs_count || 0} runs
                          </div>

                          {/* Visual Steps */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px', flexWrap: 'wrap' }}>
                            {(wf.steps || []).map((step, i) => {
                              const action = actionTypes[step.action] || { label: step.action, icon: '⚡' };
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {i > 0 && (
                                    <span style={{ color: theme.textMuted, fontSize: '12px', padding: '0 4px' }}>
                                      {step.delay_hours > 0 ? `→ ${step.delay_hours}h →` : '→'}
                                    </span>
                                  )}
                                  <span style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, fontSize: '12px', color: theme.textSecondary, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    {action.icon} {action.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => toggleActive(wf)} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: wf.active ? '#f59e0b' : '#22c55e', cursor: 'pointer', fontSize: '12px' }}>
                          {wf.active ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={() => openEdit(wf)} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '12px' }}>Edit</button>
                        <button onClick={() => handleDelete(wf.id)} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Del</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Runs Tab */}
      {activeTab === 'runs' && (
        <>
          {runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <p>No workflow runs yet.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Workflow', 'Status', 'Progress', 'Started', 'Completed'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const wf = workflows.find(w => w.id === run.workflow_id);
                    const rs = getRunStatusStyle(run.status);
                    return (
                      <tr key={run.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '12px 14px', color: theme.text, fontWeight: '500' }}>{wf?.name || 'Unknown'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: rs.bg, color: rs.color }}>{run.status}</span>
                          {run.error_message && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{run.error_message}</div>}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textSecondary, fontSize: '13px' }}>
                          Step {run.current_step}/{run.total_steps}
                        </td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '13px' }}>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '13px' }}>{run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Workflow Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '640px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>{selectedWorkflow ? 'Edit' : 'Create'} Workflow</h2>

            {/* Name & Description */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., New Lead Follow-up" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Description</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this workflow do?" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
            </div>

            {/* Trigger */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Trigger</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {Object.entries(triggerTypes).map(([key, trigger]) => (
                  <button key={key} onClick={() => setForm({ ...form, trigger_type: key })} style={{ padding: '10px', borderRadius: '8px', border: `2px solid ${form.trigger_type === key ? theme.accent : theme.border}`, backgroundColor: form.trigger_type === key ? theme.accentBg : 'transparent', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>{trigger.icon}</span>
                    <div>
                      <div style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>{trigger.label}</div>
                      <div style={{ color: theme.textMuted, fontSize: '11px' }}>{trigger.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Steps */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', color: theme.textMuted }}>Steps</label>
                <button onClick={addStep} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Add Step</button>
              </div>
              {form.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <span style={{ color: theme.accent, fontWeight: '700', fontSize: '14px', minWidth: '24px' }}>{step.step}</span>
                  <select value={step.action} onChange={e => updateStep(i, 'action', e.target.value)} style={{ flex: 1, padding: '8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }}>
                    {Object.entries(actionTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" value={step.delay_hours} onChange={e => updateStep(i, 'delay_hours', parseInt(e.target.value) || 0)} min="0" style={{ width: '60px', padding: '8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', textAlign: 'center' }} />
                    <span style={{ color: theme.textMuted, fontSize: '12px' }}>hrs</span>
                  </div>
                  <input value={step.template} onChange={e => updateStep(i, 'template', e.target.value)} placeholder="Message template..." style={{ flex: 2, padding: '8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
                  {form.steps.length > 1 && (
                    <button onClick={() => removeStep(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
                  )}
                </div>
              ))}
            </div>

            {/* Active Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} style={{ accentColor: theme.accent }} />
              <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Active (start running immediately)</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => { setShowModal(false); setSelectedWorkflow(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={!form.name} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: form.name ? 1 : 0.5 }}>Save Workflow</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
