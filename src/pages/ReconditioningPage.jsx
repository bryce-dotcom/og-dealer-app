import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function ReconditioningPage() {
  const { theme } = useTheme();
  const { dealerId, inventory, employees } = useStore();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('board');
  const [selectedVehicle, setSelectedVehicle] = useState('all');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [templateForm, setTemplateForm] = useState({ template_id: '', vehicle_id: '', new_name: '', source_vehicle_id: '' });
  const [templateBusy, setTemplateBusy] = useState(false);

  const [taskForm, setTaskForm] = useState({
    vehicle_id: '', task_type: 'inspection', title: '', description: '', priority: 'normal',
    assigned_to: '', vendor_name: '', estimated_cost: '', notes: ''
  });

  const taskTypes = {
    inspection: { label: 'Inspection', icon: '🔍', color: '#3b82f6' },
    mechanical: { label: 'Mechanical', icon: '🔧', color: '#ef4444' },
    body_work: { label: 'Body Work', icon: '🚗', color: '#f59e0b' },
    paint: { label: 'Paint', icon: '🎨', color: '#8b5cf6' },
    interior: { label: 'Interior', icon: '💺', color: '#ec4899' },
    detail: { label: 'Detail', icon: '✨', color: '#14b8a6' },
    tires: { label: 'Tires', icon: '⭕', color: '#71717a' },
    glass: { label: 'Glass', icon: '🪟', color: '#06b6d4' },
    electrical: { label: 'Electrical', icon: '⚡', color: '#eab308' },
    emissions: { label: 'Emissions', icon: '💨', color: '#84cc16' },
    safety: { label: 'Safety', icon: '🛡️', color: '#22c55e' },
    cosmetic: { label: 'Cosmetic', icon: '💅', color: '#f472b6' },
    custom: { label: 'Custom', icon: '⚙️', color: '#71717a' }
  };

  const statusColumns = [
    { key: 'pending', label: 'Pending', color: '#71717a' },
    { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
    { key: 'completed', label: 'Completed', color: '#22c55e' }
  ];

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  async function loadData() {
    setLoading(true);
    const [{ data: t, error: tErr }, { data: tp }] = await Promise.all([
      supabase.from('reconditioning_tasks').select('*').eq('dealer_id', dealerId).order('sort_order').order('created_at'),
      supabase.from('reconditioning_templates').select('*').eq('dealer_id', dealerId).order('name')
    ]);
    if (tErr) console.error('Failed to load recon tasks:', tErr);
    setTasks(t || []);
    setTemplates(tp || []);
    setLoading(false);
  }

  // Cars on the lot (both "In Stock" and "For Sale"), plus the car on the task being edited
  const inStockVehicles = (inventory || []).filter(v => ['In Stock', 'For Sale'].includes(v.status) || v.id === taskForm.vehicle_id);
  const activeEmployees = (employees || []).filter(e => e.active);
  const vehicleLabel = (v) => `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}${v.stock_number ? ' (#' + v.stock_number + ')' : ''}`;
  // "Skipped" tasks are shown in the Completed column with a tag so they don't disappear
  const inColumn = (t, key) => key === 'completed' ? (t.status === 'completed' || t.status === 'skipped') : t.status === key;

  // Vehicles with recon tasks
  const vehiclesWithTasks = [...new Set(tasks.map(t => t.vehicle_id))];
  const vehicleReconData = vehiclesWithTasks.map(vid => {
    const v = (inventory || []).find(i => i.id === vid);
    const vTasks = tasks.filter(t => t.vehicle_id === vid);
    const completed = vTasks.filter(t => t.status === 'completed').length;
    const total = vTasks.length;
    const totalCost = vTasks.reduce((sum, t) => sum + parseFloat(t.actual_cost || t.estimated_cost || 0), 0);
    return { vehicle: v, tasks: vTasks, completed, total, totalCost, vehicleId: vid, progress: total > 0 ? Math.round(completed / total * 100) : 0 };
  });

  // Stats
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.status === 'pending').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const totalEstimated = tasks.reduce((sum, t) => sum + parseFloat(t.estimated_cost || 0), 0);
  const totalActual = tasks.reduce((sum, t) => sum + parseFloat(t.actual_cost || 0), 0);

  const filteredTasks = selectedVehicle === 'all' ? tasks : tasks.filter(t => t.vehicle_id === selectedVehicle);

  async function handleSaveTask() {
    try {
      const payload = {
        dealer_id: dealerId, vehicle_id: taskForm.vehicle_id, task_type: taskForm.task_type,
        title: taskForm.title, description: taskForm.description || null, priority: taskForm.priority,
        assigned_to: taskForm.assigned_to ? parseInt(taskForm.assigned_to) : null,
        assigned_name: taskForm.assigned_to ? activeEmployees.find(e => e.id === parseInt(taskForm.assigned_to))?.name : null,
        vendor_name: taskForm.vendor_name || null,
        estimated_cost: taskForm.estimated_cost ? parseFloat(taskForm.estimated_cost) : 0,
        notes: taskForm.notes || null
      };

      if (editingTask) {
        const { error } = await supabase.from('reconditioning_tasks').update(payload).eq('id', editingTask.id).eq('dealer_id', dealerId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reconditioning_tasks').insert(payload);
        if (error) throw error;
      }
      setShowTaskModal(false);
      setEditingTask(null);
      resetTaskForm();
      loadData();
    } catch (err) { alert('Failed to save: ' + err.message); }
  }

  async function updateTaskStatus(id, status) {
    const updates = { status, updated_at: new Date().toISOString() };
    if (status === 'in_progress' && !tasks.find(t => t.id === id)?.started_at) updates.started_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from('reconditioning_tasks').update(updates).eq('id', id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to update status: ' + error.message); return; }
    loadData();
  }

  async function updateTaskCost(id, actual_cost) {
    const task = tasks.find(t => t.id === id);
    const newVal = actual_cost === '' || actual_cost === null ? null : parseFloat(actual_cost);
    if (newVal !== null && isNaN(newVal)) { alert('Actual cost must be a number.'); return; }
    const oldVal = task?.actual_cost === null || task?.actual_cost === undefined ? null : parseFloat(task.actual_cost);
    if (newVal === oldVal) return;
    const { error } = await supabase.from('reconditioning_tasks').update({ actual_cost: newVal, updated_at: new Date().toISOString() }).eq('id', id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to save actual cost: ' + error.message); return; }
    loadData();
  }

  async function handleDeleteTask(id) {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    const { error } = await supabase.from('reconditioning_tasks').delete().eq('id', id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to delete: ' + error.message); return; }
    loadData();
  }

  async function applyTemplate(templateId, vehicleId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) { alert('Please pick a template.'); return false; }
    if (!vehicleId) { alert('Please pick a vehicle.'); return false; }
    const inserts = (template.tasks || []).map(t => ({
      dealer_id: dealerId, vehicle_id: vehicleId, task_type: t.task_type || 'custom', title: t.title,
      description: t.description || null, estimated_cost: t.estimated_cost || 0,
      priority: t.priority || 'normal', sort_order: t.sort_order || 0, status: 'pending'
    }));
    if (inserts.length === 0) { alert('This template has no tasks in it.'); return false; }
    const { error } = await supabase.from('reconditioning_tasks').insert(inserts);
    if (error) { alert('Failed to apply template: ' + error.message); return false; }
    loadData();
    return true;
  }

  async function saveVehicleAsTemplate(name, vehicleId) {
    if (!name.trim()) { alert('Please enter a template name.'); return false; }
    if (!vehicleId) { alert('Please pick a vehicle whose tasks you want to copy.'); return false; }
    const vTasks = tasks.filter(t => t.vehicle_id === vehicleId);
    if (vTasks.length === 0) { alert('That vehicle has no tasks to copy.'); return false; }
    const { error } = await supabase.from('reconditioning_templates').insert({
      dealer_id: dealerId, name: name.trim(),
      tasks: vTasks.map((t, i) => ({ task_type: t.task_type, title: t.title, description: t.description || null, estimated_cost: t.estimated_cost || 0, priority: t.priority || 'normal', sort_order: i }))
    });
    if (error) { alert('Failed to save template: ' + error.message); return false; }
    loadData();
    return true;
  }

  function openEditTask(task) {
    setEditingTask(task);
    setTaskForm({ vehicle_id: task.vehicle_id, task_type: task.task_type, title: task.title,
      description: task.description || '', priority: task.priority, assigned_to: task.assigned_to || '',
      vendor_name: task.vendor_name || '', estimated_cost: task.estimated_cost || '', notes: task.notes || '' });
    setShowTaskModal(true);
  }

  function resetTaskForm() {
    setTaskForm({ vehicle_id: '', task_type: 'inspection', title: '', description: '', priority: 'normal',
      assigned_to: '', vendor_name: '', estimated_cost: '', notes: '' });
  }

  if (loading) return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><div style={{ color: theme.textSecondary }}>Loading...</div></div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Reconditioning</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Track the repairs, cleanup and prep each car needs before it's ready to sell, and what they cost</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => { setTemplateForm({ template_id: '', vehicle_id: '', new_name: '', source_vehicle_id: '' }); setShowTemplateModal(true); }} title="A template is a saved checklist of tasks you can add to a car in one click" style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Templates</button>
          <button onClick={() => { setEditingTask(null); resetTaskForm(); setShowTaskModal(true); }} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ Add Task</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Tasks', value: totalTasks, color: theme.text },
          { label: 'Pending', value: pendingTasks, color: '#71717a' },
          { label: 'In Progress', value: inProgressTasks, color: '#f59e0b' },
          { label: 'Completed', value: completedTasks, color: '#22c55e' },
          { label: 'Est. Cost', value: `$${totalEstimated.toLocaleString()}`, color: '#3b82f6' },
          { label: 'Actual Cost', value: `$${totalActual.toLocaleString()}`, color: theme.accent },
          { label: 'Vehicles', value: vehiclesWithTasks.length, color: '#8b5cf6' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'board', label: 'Board View' }, { id: 'vehicles', label: 'By Vehicle' }, { id: 'list', label: 'All Tasks' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', backgroundColor: activeTab === tab.id ? theme.accentBg : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent', color: activeTab === tab.id ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>{tab.label}</button>
        ))}
      </div>

      {/* Board View */}
      {activeTab === 'board' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {statusColumns.map(col => (
            <div key={col.key} style={{ backgroundColor: theme.bg, borderRadius: '12px', padding: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                <span style={{ color: col.color, fontWeight: '700', fontSize: '14px' }}>{col.label}</span>
                <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: `${col.color}20`, color: col.color, fontSize: '12px', fontWeight: '700' }}>
                  {filteredTasks.filter(t => inColumn(t, col.key)).length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredTasks.filter(t => inColumn(t, col.key)).length === 0 && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, padding: '8px 4px' }}>
                    {col.key === 'pending' ? 'No tasks waiting. Click "+ Add Task" to add one.' : col.key === 'in_progress' ? 'Click "Start" on a pending task to move it here.' : 'Click "Done" on a task in progress to move it here.'}
                  </div>
                )}
                {filteredTasks.filter(t => inColumn(t, col.key)).map(task => {
                  const tt = taskTypes[task.task_type] || taskTypes.custom;
                  const v = (inventory || []).find(i => i.id === task.vehicle_id);
                  return (
                    <div key={task.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px', opacity: task.status === 'skipped' ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '16px' }}>{tt.icon}</span>
                          <span style={{ color: theme.text, fontWeight: '600', fontSize: '13px', textDecoration: task.status === 'skipped' ? 'line-through' : 'none' }}>{task.title}</span>
                          {task.status === 'skipped' && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: 'rgba(113,113,122,0.2)', color: theme.textMuted, fontWeight: '600' }}>skipped</span>}
                        </div>
                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: task.priority === 'urgent' ? 'rgba(239,68,68,0.15)' : task.priority === 'high' ? 'rgba(245,158,11,0.15)' : 'transparent', color: task.priority === 'urgent' ? '#ef4444' : task.priority === 'high' ? '#f59e0b' : theme.textMuted }}>
                          {task.priority !== 'normal' ? task.priority : ''}
                        </span>
                      </div>
                      {v && <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>{v.year} {v.make} {v.model}{v.stock_number ? ` #${v.stock_number}` : ''}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: theme.accent, fontWeight: '600' }} title={task.actual_cost ? 'Actual cost' : 'Estimated cost (no actual cost entered yet)'}>${parseFloat(task.actual_cost || task.estimated_cost || 0).toLocaleString()}{!task.actual_cost && <span style={{ color: theme.textMuted, fontWeight: '400' }}> est.</span>}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {col.key === 'pending' && <button onClick={() => updateTaskStatus(task.id, 'in_progress')} style={{ padding: '2px 8px', backgroundColor: 'rgba(245,158,11,0.15)', border: 'none', borderRadius: '4px', color: '#f59e0b', cursor: 'pointer', fontSize: '11px' }}>Start</button>}
                          {col.key === 'in_progress' && <button onClick={() => updateTaskStatus(task.id, 'completed')} style={{ padding: '2px 8px', backgroundColor: 'rgba(34,197,94,0.15)', border: 'none', borderRadius: '4px', color: '#22c55e', cursor: 'pointer', fontSize: '11px' }}>Done</button>}
                          <button onClick={() => openEditTask(task)} style={{ padding: '2px 6px', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '11px' }}>✎</button>
                        </div>
                      </div>
                      {task.assigned_name && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>👤 {task.assigned_name}</div>}
                      {col.key !== 'pending' && task.status !== 'skipped' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <label style={{ fontSize: '11px', color: theme.textMuted }}>Actual $</label>
                          <input key={`${task.id}-${task.actual_cost ?? ''}`} type="number" min="0" step="0.01" defaultValue={task.actual_cost ?? ''} placeholder="what it really cost" onBlur={e => updateTaskCost(task.id, e.target.value)} style={{ flex: 1, minWidth: 0, padding: '3px 6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.text, fontSize: '11px' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vehicles View */}
      {activeTab === 'vehicles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {vehicleReconData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔧</div>
              <p>No vehicles in reconditioning. Add tasks to get started.</p>
            </div>
          ) : vehicleReconData.map(vr => (
            <div key={vr.vehicleId} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>
                    {vr.vehicle ? `${vr.vehicle.year} ${vr.vehicle.make} ${vr.vehicle.model}` : vr.vehicleId}
                  </span>
                  {vr.vehicle?.stock_number && <span style={{ color: theme.textMuted, fontSize: '13px', marginLeft: '8px' }}>#{vr.vehicle.stock_number}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: theme.accent, fontWeight: '700' }}>${vr.totalCost.toLocaleString()}</span>
                  <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: vr.progress === 100 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: vr.progress === 100 ? '#22c55e' : '#f59e0b' }}>
                    {vr.completed}/{vr.total} ({vr.progress}%)
                  </span>
                </div>
              </div>
              <div style={{ height: '6px', backgroundColor: theme.bg, borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ height: '100%', width: `${vr.progress}%`, backgroundColor: vr.progress === 100 ? '#22c55e' : theme.accent, borderRadius: '3px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {vr.tasks.map(task => {
                  const tt = taskTypes[task.task_type] || taskTypes.custom;
                  const stColor = task.status === 'completed' ? '#22c55e' : task.status === 'in_progress' ? '#f59e0b' : '#71717a';
                  return (
                    <span key={task.id} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', backgroundColor: `${stColor}15`, color: stColor, border: `1px solid ${stColor}30`, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {tt.icon} {task.title}
                      {task.status === 'completed' && ' ✓'}
                      {task.status === 'skipped' && ' (skipped)'}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {activeTab === 'list' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} style={{ padding: '8px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '13px' }}>
              <option value="all">All Vehicles</option>
              {vehiclesWithTasks.map(vid => {
                const v = (inventory || []).find(i => i.id === vid);
                return <option key={vid} value={vid}>{v ? vehicleLabel(v) : vid}</option>;
              })}
            </select>
          </div>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Task', 'Vehicle', 'Type', 'Assigned', 'Est.', 'Actual', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '14px' }}>No recon tasks yet. Click "+ Add Task" to add one, or use "Templates" to add a whole checklist to a car.</td></tr>
                )}
                {filteredTasks.map(task => {
                  const tt = taskTypes[task.task_type] || taskTypes.custom;
                  const v = (inventory || []).find(i => i.id === task.vehicle_id);
                  const stColor = task.status === 'completed' ? '#22c55e' : task.status === 'in_progress' ? '#f59e0b' : '#71717a';
                  return (
                    <tr key={task.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{tt.icon}</span>
                          <span style={{ color: theme.text, fontWeight: '500', fontSize: '14px' }}>{task.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: theme.textSecondary, fontSize: '13px' }}>{v ? `${v.year} ${v.make} ${v.model}` : task.vehicle_id}</td>
                      <td style={{ padding: '12px 14px', color: theme.textSecondary, fontSize: '13px' }}>{tt.label}</td>
                      <td style={{ padding: '12px 14px', color: theme.textSecondary, fontSize: '13px' }}>{task.assigned_name || task.vendor_name || '—'}</td>
                      <td style={{ padding: '12px 14px', color: theme.textSecondary, fontSize: '13px' }}>${parseFloat(task.estimated_cost || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px', color: theme.accent, fontWeight: '600', fontSize: '13px' }}>
                        <input key={`${task.id}-${task.actual_cost ?? ''}`} type="number" min="0" step="0.01" defaultValue={task.actual_cost ?? ''} placeholder="$" title="Enter what this task actually cost. Saves when you click away." onBlur={e => updateTaskCost(task.id, e.target.value)} style={{ width: '90px', padding: '4px 6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.text, fontSize: '12px' }} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: `${stColor}20`, color: stColor }}>{task.status.replace('_', ' ')}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <select value={task.status} onChange={e => updateTaskStatus(task.id, e.target.value)} style={{ padding: '4px 6px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, fontSize: '11px' }}>
                            {statusColumns.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            <option value="skipped">Skip</option>
                          </select>
                          <button onClick={() => openEditTask(task)} style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                          <button onClick={() => handleDeleteTask(task.id)} style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '560px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>{editingTask ? 'Edit' : 'Add'} Recon Task</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Vehicle *</label>
                <select value={taskForm.vehicle_id} onChange={e => setTaskForm({ ...taskForm, vehicle_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">Select vehicle...</option>
                  {inStockVehicles.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Type</label>
                <select value={taskForm.task_type} onChange={e => setTaskForm({ ...taskForm, task_type: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {Object.entries(taskTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Priority</label>
                <select value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Title *</label>
                <input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="e.g., Replace front brake pads" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Assign To</label>
                <select value={taskForm.assigned_to} onChange={e => setTaskForm({ ...taskForm, assigned_to: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">Unassigned</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Estimated Cost</label>
                <input type="number" value={taskForm.estimated_cost} onChange={e => setTaskForm({ ...taskForm, estimated_cost: e.target.value })} placeholder="$" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Notes</label>
                <textarea value={taskForm.notes} onChange={e => setTaskForm({ ...taskForm, notes: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => { setShowTaskModal(false); setEditingTask(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSaveTask} disabled={!taskForm.vehicle_id || !taskForm.title} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: taskForm.vehicle_id && taskForm.title ? 1 : 0.5 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '560px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>Recon Templates</h2>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: 0, marginBottom: '20px' }}>A template is a saved checklist of tasks (e.g. "Standard used-car prep"). Apply one to add all its tasks to a car at once.</p>

            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Apply a template to a car</div>
            {templates.length === 0 ? (
              <div style={{ fontSize: '13px', color: theme.textMuted, padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', marginBottom: '20px' }}>No templates yet. Add tasks to a car first, then save them as a template below.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Template *</label>
                  <select value={templateForm.template_id} onChange={e => setTemplateForm({ ...templateForm, template_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                    <option value="">Select template...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({(t.tasks || []).length} tasks)</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Vehicle *</label>
                  <select value={templateForm.vehicle_id} onChange={e => setTemplateForm({ ...templateForm, vehicle_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                    <option value="">Select vehicle...</option>
                    {inStockVehicles.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <button disabled={templateBusy} onClick={async () => { setTemplateBusy(true); const ok = await applyTemplate(templateForm.template_id, templateForm.vehicle_id); setTemplateBusy(false); if (ok) setShowTemplateModal(false); }} style={{ padding: '8px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: templateBusy ? 0.6 : 1 }}>Add Tasks to Car</button>
                </div>
              </div>
            )}

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Save a car's tasks as a new template</div>
              {vehiclesWithTasks.length === 0 ? (
                <div style={{ fontSize: '13px', color: theme.textMuted }}>No cars have tasks yet. Add tasks to a car with "+ Add Task", then come back here to save them as a template.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Template name *</label>
                    <input value={templateForm.new_name} onChange={e => setTemplateForm({ ...templateForm, new_name: e.target.value })} placeholder="e.g., Standard prep" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Copy tasks from *</label>
                    <select value={templateForm.source_vehicle_id} onChange={e => setTemplateForm({ ...templateForm, source_vehicle_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                      <option value="">Select vehicle...</option>
                      {vehiclesWithTasks.map(vid => {
                        const v = (inventory || []).find(i => i.id === vid);
                        return <option key={vid} value={vid}>{v ? vehicleLabel(v) : vid} ({tasks.filter(t => t.vehicle_id === vid).length} tasks)</option>;
                      })}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                    <button disabled={templateBusy} onClick={async () => { setTemplateBusy(true); const ok = await saveVehicleAsTemplate(templateForm.new_name, templateForm.source_vehicle_id); setTemplateBusy(false); if (ok) setTemplateForm({ ...templateForm, new_name: '', source_vehicle_id: '' }); }} style={{ padding: '8px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.accent}`, borderRadius: '8px', color: theme.accent, cursor: 'pointer', fontWeight: '600', opacity: templateBusy ? 0.6 : 1 }}>Save as Template</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowTemplateModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
