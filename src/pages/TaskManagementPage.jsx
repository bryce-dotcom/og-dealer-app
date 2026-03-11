import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function TaskManagementPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [view, setView] = useState('board'); // 'board' or 'list'
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [employees, setEmployees] = useState([]);

  const [form, setForm] = useState({
    title: '', description: '', category: 'general', priority: 'normal',
    assigned_to: '', assigned_name: '', due_date: '', status: 'todo',
    vehicle_id: '', deal_id: '', customer_id: '',
    checklist: [], tags: [], notes: ''
  });
  const [newCheckItem, setNewCheckItem] = useState('');

  const categories = ['general', 'sales', 'finance', 'service', 'admin', 'compliance', 'marketing', 'inventory', 'customer', 'other'];
  const priorities = ['low', 'normal', 'high', 'urgent'];
  const statuses = ['todo', 'in_progress', 'review', 'completed', 'cancelled'];

  const priorityColors = { low: '#71717a', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };
  const statusLabels = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', completed: 'Done', cancelled: 'Cancelled' };

  useEffect(() => { if (dealerId) { fetchTasks(); fetchEmployees(); } }, [dealerId]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('dealer_tasks')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('sort_order').order('created_at', { ascending: false });
    setTasks(data || []);
    setLoading(false);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true);
    setEmployees(data || []);
  };

  const handleSave = async () => {
    const emp = employees.find(e => e.id === parseInt(form.assigned_to));
    const payload = {
      dealer_id: dealerId,
      title: form.title,
      description: form.description || null,
      category: form.category,
      priority: form.priority,
      assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      assigned_name: emp?.name || null,
      due_date: form.due_date || null,
      status: form.status,
      vehicle_id: form.vehicle_id || null,
      deal_id: form.deal_id ? parseInt(form.deal_id) : null,
      customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      checklist: form.checklist.length > 0 ? form.checklist : null,
      tags: form.tags.length > 0 ? form.tags : null,
      notes: form.notes || null
    };

    if (form.status === 'in_progress' && !editingTask?.started_at) payload.started_at = new Date().toISOString();
    if (form.status === 'completed' && !editingTask?.completed_at) payload.completed_at = new Date().toISOString();

    if (editingTask) {
      await supabase.from('dealer_tasks').update(payload).eq('id', editingTask.id);
    } else {
      await supabase.from('dealer_tasks').insert(payload);
    }
    setShowModal(false);
    setEditingTask(null);
    resetForm();
    fetchTasks();
  };

  const resetForm = () => setForm({
    title: '', description: '', category: 'general', priority: 'normal',
    assigned_to: '', assigned_name: '', due_date: '', status: 'todo',
    vehicle_id: '', deal_id: '', customer_id: '',
    checklist: [], tags: [], notes: ''
  });

  const openEdit = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title || '',
      description: task.description || '',
      category: task.category || 'general',
      priority: task.priority || 'normal',
      assigned_to: task.assigned_to?.toString() || '',
      assigned_name: task.assigned_name || '',
      due_date: task.due_date || '',
      status: task.status || 'todo',
      vehicle_id: task.vehicle_id || '',
      deal_id: task.deal_id?.toString() || '',
      customer_id: task.customer_id?.toString() || '',
      checklist: task.checklist || [],
      tags: task.tags || [],
      notes: task.notes || ''
    });
    setShowModal(true);
  };

  const updateTaskStatus = async (id, status) => {
    const updates = { status };
    if (status === 'in_progress') updates.started_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    await supabase.from('dealer_tasks').update(updates).eq('id', id);
    fetchTasks();
  };

  const deleteTask = async (id) => {
    if (!confirm('Delete this task?')) return;
    await supabase.from('dealer_tasks').delete().eq('id', id);
    fetchTasks();
  };

  const toggleChecklist = async (taskId, idx) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task?.checklist) return;
    const updated = [...task.checklist];
    updated[idx] = { ...updated[idx], completed: !updated[idx].completed, completed_at: !updated[idx].completed ? new Date().toISOString() : null };
    await supabase.from('dealer_tasks').update({ checklist: updated }).eq('id', taskId);
    fetchTasks();
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setForm({ ...form, checklist: [...form.checklist, { item: newCheckItem.trim(), completed: false, completed_at: null }] });
    setNewCheckItem('');
  };

  const removeCheckItem = (idx) => {
    setForm({ ...form, checklist: form.checklist.filter((_, i) => i !== idx) });
  };

  const filtered = tasks.filter(t => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  const boardColumns = ['todo', 'in_progress', 'review', 'completed'];

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && !['completed', 'cancelled'].includes(t.status)).length
  };

  const isOverdue = (t) => t.due_date && new Date(t.due_date) < new Date() && !['completed', 'cancelled'].includes(t.status);

  const inputStyle = {
    width: '100%', padding: '8px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px',
    color: theme.text, fontSize: '14px'
  };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  const TaskCard = ({ task }) => (
    <div style={{
      backgroundColor: theme.bgCard, border: `1px solid ${isOverdue(task) ? '#ef4444' : theme.border}`,
      borderRadius: '10px', padding: '12px', marginBottom: '8px', cursor: 'pointer'
    }} onClick={() => openEdit(task)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text, flex: 1 }}>{task.title}</span>
        <span style={{
          padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
          backgroundColor: priorityColors[task.priority] + '22', color: priorityColors[task.priority]
        }}>{task.priority}</span>
      </div>
      {task.description && (
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.description}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', backgroundColor: theme.accentBg, color: theme.accent }}>{task.category}</span>
        {task.assigned_name && (
          <span style={{ fontSize: '11px', color: theme.textMuted }}>{task.assigned_name}</span>
        )}
        {task.due_date && (
          <span style={{ fontSize: '11px', color: isOverdue(task) ? '#ef4444' : theme.textMuted }}>
            Due {new Date(task.due_date + 'T00:00:00').toLocaleDateString()}
          </span>
        )}
        {task.checklist?.length > 0 && (
          <span style={{ fontSize: '11px', color: theme.textMuted }}>
            {task.checklist.filter(c => c.completed).length}/{task.checklist.length}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Task Management</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Track and manage team tasks</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ display: 'flex', border: `1px solid ${theme.border}`, borderRadius: '8px', overflow: 'hidden' }}>
            <button onClick={() => setView('board')} style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '13px',
              backgroundColor: view === 'board' ? theme.accent : 'transparent', color: view === 'board' ? '#fff' : theme.textSecondary
            }}>Board</button>
            <button onClick={() => setView('list')} style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '13px',
              backgroundColor: view === 'list' ? theme.accent : 'transparent', color: view === 'list' ? '#fff' : theme.textSecondary
            }}>List</button>
          </div>
          <button onClick={() => { resetForm(); setEditingTask(null); setShowModal(true); }} style={{
            padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
            border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
          }}>+ New Task</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Tasks', value: stats.total, color: theme.accent },
          { label: 'To Do', value: stats.todo, color: '#71717a' },
          { label: 'In Progress', value: stats.inProgress, color: '#3b82f6' },
          { label: 'Overdue', value: stats.overdue, color: '#ef4444' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="all">All Priorities</option>
          {priorities.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
      ) : view === 'board' ? (
        /* Board View */
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${boardColumns.length}, 1fr)`, gap: '16px', minHeight: '400px' }}>
          {boardColumns.map(col => {
            const colTasks = filtered.filter(t => t.status === col);
            return (
              <div key={col} style={{ backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: theme.text, textTransform: 'uppercase' }}>{statusLabels[col]}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                    backgroundColor: theme.accentBg, color: theme.accent
                  }}>{colTasks.length}</span>
                </div>
                {colTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted, fontSize: '12px' }}>No tasks</div>
                ) : (
                  colTasks.map(task => <TaskCard key={task.id} task={task} />)
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Title', 'Category', 'Priority', 'Assigned', 'Due Date', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px', textAlign: 'left', color: theme.textSecondary, fontWeight: '600', fontSize: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.filter(t => t.status !== 'cancelled').map(task => (
                <tr key={task.id} style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: isOverdue(task) ? '#ef444410' : 'transparent' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: '600', color: theme.text }}>{task.title}</div>
                    {task.description && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{task.description.substring(0, 60)}</div>}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', backgroundColor: theme.accentBg, color: theme.accent }}>{task.category}</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', backgroundColor: priorityColors[task.priority] + '22', color: priorityColors[task.priority] }}>{task.priority}</span>
                  </td>
                  <td style={{ padding: '12px', color: theme.textSecondary }}>{task.assigned_name || '-'}</td>
                  <td style={{ padding: '12px', color: isOverdue(task) ? '#ef4444' : theme.textSecondary }}>
                    {task.due_date ? new Date(task.due_date + 'T00:00:00').toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <select value={task.status} onChange={e => updateTaskStatus(task.id, e.target.value)} style={{
                      padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                      backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, cursor: 'pointer'
                    }}>
                      {statuses.map(s => <option key={s} value={s}>{statusLabels[s] || s}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => openEdit(task)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px' }}>Edit</button>
                      <button onClick={() => deleteTask(task.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '600px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>
                {editingTask ? 'Edit Task' : 'New Task'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditingTask(null); }} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Title *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} placeholder="Task title" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Task details" />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
                  {priorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Assigned To</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} style={inputStyle}>
                  <option value="">Unassigned</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} style={inputStyle} />
              </div>
              {editingTask && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    {statuses.map(s => <option key={s} value={s}>{statusLabels[s] || s}</option>)}
                  </select>
                </div>
              )}

              {/* Checklist */}
              <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                <label style={labelStyle}>Checklist</label>
                {form.checklist.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <input type="checkbox" checked={item.completed} onChange={() => {
                      const updated = [...form.checklist];
                      updated[idx] = { ...updated[idx], completed: !updated[idx].completed };
                      setForm({ ...form, checklist: updated });
                    }} />
                    <span style={{ flex: 1, fontSize: '13px', color: item.completed ? theme.textMuted : theme.text, textDecoration: item.completed ? 'line-through' : 'none' }}>{item.item}</span>
                    <button onClick={() => removeCheckItem(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCheckItem()} style={{ ...inputStyle, flex: 1 }} placeholder="Add checklist item" />
                  <button onClick={addCheckItem} style={{
                    padding: '8px 14px', backgroundColor: theme.accentBg, color: theme.accent,
                    border: `1px solid ${theme.accent}44`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px'
                  }}>Add</button>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '20px' }}>
              <div>
                {editingTask && (
                  <button onClick={() => { deleteTask(editingTask.id); setShowModal(false); setEditingTask(null); }} style={{
                    padding: '10px 20px', backgroundColor: 'transparent', color: '#ef4444',
                    border: '1px solid #ef4444', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                  }}>Delete</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => { setShowModal(false); setEditingTask(null); }} style={{
                  padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary,
                  border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
                }}>Cancel</button>
                <button onClick={handleSave} disabled={!form.title} style={{
                  padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
                  border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px',
                  opacity: !form.title ? 0.5 : 1
                }}>{editingTask ? 'Update' : 'Create'} Task</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}