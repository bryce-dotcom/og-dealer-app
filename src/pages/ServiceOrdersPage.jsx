import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function ServiceOrdersPage() {
  const { theme } = useTheme();
  const { dealer } = useStore();
  const dealerId = dealer?.id;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [filter, setFilter] = useState('all');
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [showLineModal, setShowLineModal] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);

  const [form, setForm] = useState({
    vehicle_id: '', customer_id: '', order_number: '', order_type: 'repair',
    priority: 'normal', mileage_in: '', customer_concern: '', diagnosis: '',
    recommendation: '', technician_id: '', advisor_id: '',
    payment_method: '', promised_date: '', vendor_id: '', status: 'open', notes: ''
  });

  const [lineForm, setLineForm] = useState({
    line_type: 'labor', description: '', quantity: '1', unit_price: '0',
    part_number: '', labor_hours: '', labor_rate: ''
  });

  const orderTypes = {
    repair: 'Repair', maintenance: 'Maintenance', detail: 'Detail', inspection: 'Inspection',
    warranty: 'Warranty', recall: 'Recall', internal: 'Internal', customer_pay: 'Customer Pay'
  };
  const statuses = ['estimate', 'open', 'in_progress', 'waiting_parts', 'waiting_approval', 'completed', 'invoiced', 'closed', 'cancelled'];
  const statusColors = {
    estimate: '#71717a', open: '#3b82f6', in_progress: '#f59e0b', waiting_parts: '#8b5cf6',
    waiting_approval: '#ec4899', completed: '#22c55e', invoiced: '#06b6d4', closed: '#71717a', cancelled: '#ef4444'
  };

  useEffect(() => { if (dealerId) { fetchOrders(); fetchRelated(); } }, [dealerId]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('service_orders')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  const fetchRelated = async () => {
    const [v, c, e, vn] = await Promise.all([
      supabase.from('inventory').select('id, year, make, model, stock_number').eq('dealer_id', dealerId),
      supabase.from('customers').select('id, first_name, last_name, phone').eq('dealer_id', dealerId),
      supabase.from('employees').select('id, name').eq('dealer_id', dealerId).eq('active', true),
      supabase.from('vendors').select('id, name, vendor_type').eq('dealer_id', dealerId).eq('active', true)
    ]);
    setVehicles(v.data || []);
    setCustomers(c.data || []);
    setEmployees(e.data || []);
    setVendors(vn.data || []);
  };

  const fetchLineItems = async (orderId) => {
    const { data } = await supabase
      .from('service_line_items')
      .select('*')
      .eq('service_order_id', orderId)
      .eq('dealer_id', dealerId)
      .order('sort_order');
    setLineItems(data || []);
  };

  const handleSave = async () => {
    const techEmp = employees.find(e => e.id === parseInt(form.technician_id));
    const advEmp = employees.find(e => e.id === parseInt(form.advisor_id));
    const payload = {
      dealer_id: dealerId,
      vehicle_id: form.vehicle_id || null,
      customer_id: form.customer_id ? parseInt(form.customer_id) : null,
      order_number: form.order_number || null,
      order_type: form.order_type,
      priority: form.priority,
      mileage_in: form.mileage_in ? parseInt(form.mileage_in) : null,
      customer_concern: form.customer_concern || null,
      diagnosis: form.diagnosis || null,
      recommendation: form.recommendation || null,
      technician_id: form.technician_id ? parseInt(form.technician_id) : null,
      technician_name: techEmp?.name || null,
      advisor_id: form.advisor_id ? parseInt(form.advisor_id) : null,
      advisor_name: advEmp?.name || null,
      payment_method: form.payment_method || null,
      promised_date: form.promised_date || null,
      vendor_id: form.vendor_id || null,
      status: form.status,
      notes: form.notes || null
    };

    if (form.status === 'in_progress' && !editingOrder?.started_at) payload.started_at = new Date().toISOString();
    if (form.status === 'completed' && !editingOrder?.completed_at) payload.completed_at = new Date().toISOString();

    if (editingOrder) {
      await supabase.from('service_orders').update(payload).eq('id', editingOrder.id);
    } else {
      await supabase.from('service_orders').insert(payload);
    }
    setShowModal(false);
    setEditingOrder(null);
    resetForm();
    fetchOrders();
  };

  const resetForm = () => setForm({
    vehicle_id: '', customer_id: '', order_number: '', order_type: 'repair',
    priority: 'normal', mileage_in: '', customer_concern: '', diagnosis: '',
    recommendation: '', technician_id: '', advisor_id: '',
    payment_method: '', promised_date: '', vendor_id: '', status: 'open', notes: ''
  });

  const openEdit = (order) => {
    setEditingOrder(order);
    setForm({
      vehicle_id: order.vehicle_id || '', customer_id: order.customer_id?.toString() || '',
      order_number: order.order_number || '', order_type: order.order_type || 'repair',
      priority: order.priority || 'normal', mileage_in: order.mileage_in?.toString() || '',
      customer_concern: order.customer_concern || '', diagnosis: order.diagnosis || '',
      recommendation: order.recommendation || '',
      technician_id: order.technician_id?.toString() || '', advisor_id: order.advisor_id?.toString() || '',
      payment_method: order.payment_method || '', promised_date: order.promised_date || '',
      vendor_id: order.vendor_id || '', status: order.status || 'open', notes: order.notes || ''
    });
    setShowModal(true);
  };

  const updateStatus = async (id, status) => {
    const updates = { status };
    if (status === 'in_progress') updates.started_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    await supabase.from('service_orders').update(updates).eq('id', id);
    fetchOrders();
  };

  const deleteOrder = async (id) => {
    if (!confirm('Delete this service order?')) return;
    await supabase.from('service_orders').delete().eq('id', id);
    fetchOrders();
  };

  const addLineItem = async () => {
    const total = parseFloat(lineForm.quantity || 1) * parseFloat(lineForm.unit_price || 0);
    await supabase.from('service_line_items').insert({
      service_order_id: activeOrderId,
      dealer_id: dealerId,
      line_type: lineForm.line_type,
      description: lineForm.description,
      quantity: parseFloat(lineForm.quantity || 1),
      unit_price: parseFloat(lineForm.unit_price || 0),
      total,
      part_number: lineForm.part_number || null,
      labor_hours: lineForm.labor_hours ? parseFloat(lineForm.labor_hours) : null,
      labor_rate: lineForm.labor_rate ? parseFloat(lineForm.labor_rate) : null
    });
    // Update order totals
    const { data: items } = await supabase.from('service_line_items').select('*').eq('service_order_id', activeOrderId);
    const parts = (items || []).filter(i => i.line_type === 'parts').reduce((s, i) => s + parseFloat(i.total || 0), 0);
    const labor = (items || []).filter(i => i.line_type === 'labor').reduce((s, i) => s + parseFloat(i.total || 0), 0);
    const sublet = (items || []).filter(i => i.line_type === 'sublet').reduce((s, i) => s + parseFloat(i.total || 0), 0);
    await supabase.from('service_orders').update({
      parts_cost: parts, labor_cost: labor, sublet_cost: sublet, total: parts + labor + sublet
    }).eq('id', activeOrderId);

    setLineForm({ line_type: 'labor', description: '', quantity: '1', unit_price: '0', part_number: '', labor_hours: '', labor_rate: '' });
    fetchLineItems(activeOrderId);
    fetchOrders();
  };

  const deleteLineItem = async (itemId) => {
    await supabase.from('service_line_items').delete().eq('id', itemId);
    fetchLineItems(activeOrderId);
    fetchOrders();
  };

  const openLineItems = (orderId) => {
    setActiveOrderId(orderId);
    fetchLineItems(orderId);
    setShowLineModal(true);
  };

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const getVehicle = (id) => vehicles.find(v => v.id === id);
  const getCustomer = (id) => customers.find(c => c.id === id);

  const stats = {
    total: orders.length,
    open: orders.filter(o => ['open', 'in_progress', 'waiting_parts', 'waiting_approval'].includes(o.status)).length,
    revenue: orders.filter(o => ['completed', 'invoiced', 'closed'].includes(o.status)).reduce((s, o) => s + parseFloat(o.total || 0), 0),
    today: orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length
  };

  const inputStyle = { width: '100%', padding: '8px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px' };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Service Orders</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Manage repair and service work orders</p>
        </div>
        <button onClick={() => { resetForm(); setEditingOrder(null); setShowModal(true); }} style={{
          padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
          border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px'
        }}>+ New Order</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Orders', value: stats.total, color: theme.accent },
          { label: 'Open/Active', value: stats.open, color: '#3b82f6' },
          { label: 'Revenue', value: `$${stats.revenue.toLocaleString()}`, color: '#22c55e' },
          { label: 'Created Today', value: stats.today, color: '#f59e0b' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textSecondary }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Status Filters */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === 'all' ? theme.accent : theme.border}`,
          backgroundColor: filter === 'all' ? theme.accentBg : 'transparent', color: filter === 'all' ? theme.accent : theme.textSecondary,
          cursor: 'pointer', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap'
        }}>All ({orders.length})</button>
        {statuses.map(s => {
          const count = orders.filter(o => o.status === s).length;
          if (count === 0 && !['open', 'in_progress', 'completed'].includes(s)) return null;
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '6px 14px', borderRadius: '20px', border: `1px solid ${filter === s ? statusColors[s] : theme.border}`,
              backgroundColor: filter === s ? statusColors[s] + '22' : 'transparent',
              color: filter === s ? statusColors[s] : theme.textSecondary,
              cursor: 'pointer', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap'
            }}>{s.replace(/_/g, ' ')} ({count})</button>
          );
        })}
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: theme.textSecondary }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No service orders found</div>
      ) : (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Order #', 'Vehicle', 'Customer', 'Type', 'Technician', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px', textAlign: 'left', color: theme.textSecondary, fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const veh = getVehicle(order.vehicle_id);
                const cust = getCustomer(order.customer_id);
                return (
                  <tr key={order.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: theme.text }}>{order.order_number || '-'}</td>
                    <td style={{ padding: '12px', color: theme.text }}>{veh ? `${veh.year} ${veh.make} ${veh.model}` : '-'}</td>
                    <td style={{ padding: '12px', color: theme.textSecondary }}>{cust ? `${cust.first_name} ${cust.last_name}` : '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', backgroundColor: theme.accentBg, color: theme.accent }}>{orderTypes[order.order_type] || order.order_type}</span>
                    </td>
                    <td style={{ padding: '12px', color: theme.textSecondary }}>{order.technician_name || '-'}</td>
                    <td style={{ padding: '12px', fontWeight: '600', color: theme.text }}>${parseFloat(order.total || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px' }}>
                      <select value={order.status} onChange={e => updateStatus(order.id, e.target.value)} style={{
                        padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                        backgroundColor: (statusColors[order.status] || '#71717a') + '22',
                        color: statusColors[order.status] || '#71717a',
                        border: `1px solid ${statusColors[order.status] || '#71717a'}44`, cursor: 'pointer'
                      }}>
                        {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openLineItems(order.id)} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '13px' }}>Items</button>
                        <button onClick={() => openEdit(order)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px' }}>Edit</button>
                        <button onClick={() => deleteOrder(order.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Order Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>{editingOrder ? 'Edit Order' : 'New Service Order'}</h2>
              <button onClick={() => { setShowModal(false); setEditingOrder(null); }} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Vehicle</label>
                <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} style={inputStyle}>
                  <option value="">Select vehicle</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.stock_number} - {v.year} {v.make} {v.model}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Customer</label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
                  <option value="">Select customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Order Number</label>
                <input value={form.order_number} onChange={e => setForm({ ...form, order_number: e.target.value })} style={inputStyle} placeholder="SO-001" />
              </div>
              <div>
                <label style={labelStyle}>Order Type</label>
                <select value={form.order_type} onChange={e => setForm({ ...form, order_type: e.target.value })} style={inputStyle}>
                  {Object.entries(orderTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
                  {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Mileage In</label>
                <input type="number" value={form.mileage_in} onChange={e => setForm({ ...form, mileage_in: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Technician</label>
                <select value={form.technician_id} onChange={e => setForm({ ...form, technician_id: e.target.value })} style={inputStyle}>
                  <option value="">Select</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Service Advisor</label>
                <select value={form.advisor_id} onChange={e => setForm({ ...form, advisor_id: e.target.value })} style={inputStyle}>
                  <option value="">Select</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Promised Date</label>
                <input type="date" value={form.promised_date} onChange={e => setForm({ ...form, promised_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Vendor (Sublet)</label>
                <select value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })} style={inputStyle}>
                  <option value="">None</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Customer Concern</label>
                <textarea value={form.customer_concern} onChange={e => setForm({ ...form, customer_concern: e.target.value })} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Diagnosis</label>
                <textarea value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, minHeight: '50px', resize: 'vertical' }} />
              </div>
              {editingOrder && (
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => { setShowModal(false); setEditingOrder(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>{editingOrder ? 'Update' : 'Create'} Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Line Items Modal */}
      {showLineModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>Line Items</h2>
              <button onClick={() => setShowLineModal(false)} style={{ background: 'none', border: 'none', color: theme.textSecondary, cursor: 'pointer', fontSize: '20px' }}>×</button>
            </div>

            {/* Existing items */}
            {lineItems.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                {lineItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent, marginRight: '8px' }}>{item.line_type}</span>
                      <span style={{ color: theme.text, fontSize: '13px' }}>{item.description}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '13px' }}>${parseFloat(item.total || 0).toFixed(2)}</span>
                      <button onClick={() => deleteLineItem(item.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>×</button>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '8px 12px', fontWeight: '700', color: theme.text, textAlign: 'right' }}>
                  Total: ${lineItems.reduce((s, i) => s + parseFloat(i.total || 0), 0).toFixed(2)}
                </div>
              </div>
            )}

            {/* Add new line */}
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Add Line Item</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={lineForm.line_type} onChange={e => setLineForm({ ...lineForm, line_type: e.target.value })} style={inputStyle}>
                    {['labor', 'parts', 'sublet', 'fee', 'discount'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Description *</label>
                  <input value={lineForm.description} onChange={e => setLineForm({ ...lineForm, description: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Qty</label>
                  <input type="number" value={lineForm.quantity} onChange={e => setLineForm({ ...lineForm, quantity: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Unit Price</label>
                  <input type="number" step="0.01" value={lineForm.unit_price} onChange={e => setLineForm({ ...lineForm, unit_price: e.target.value })} style={inputStyle} />
                </div>
                {lineForm.line_type === 'parts' && (
                  <div>
                    <label style={labelStyle}>Part Number</label>
                    <input value={lineForm.part_number} onChange={e => setLineForm({ ...lineForm, part_number: e.target.value })} style={inputStyle} />
                  </div>
                )}
              </div>
              <button onClick={addLineItem} disabled={!lineForm.description} style={{
                marginTop: '12px', padding: '8px 16px', backgroundColor: theme.accent, color: '#fff',
                border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px',
                opacity: !lineForm.description ? 0.5 : 1
              }}>Add Item</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}