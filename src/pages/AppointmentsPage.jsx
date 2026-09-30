import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

// Local calendar date as YYYY-MM-DD (toISOString() is UTC and flips to tomorrow in the evening in Utah).
const localYMD = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const displayName = (c) => (c && (c.name || [c.first_name, c.last_name].filter(Boolean).join(' '))) || 'Unnamed customer';
// 'HH:MM' + minutes -> 'HH:MM' (clamped to 23:59 so it never rolls into the next day).
function addMinutes(time, minutes) {
  const [h, m] = String(time || '').split(':').map(n => parseInt(n, 10));
  if (isNaN(h) || isNaN(m)) return null;
  const total = Math.min(h * 60 + m + (parseInt(minutes, 10) || 0), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function AppointmentsPage() {
  const { dealerId, customers, employees } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [view, setView] = useState('week'); // day, week, list
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [form, setForm] = useState({
    customer_id: '', customer_name: '', customer_phone: '', customer_email: '',
    employee_id: '', employee_name: '', appointment_type: 'test_drive',
    title: '', description: '', scheduled_date: '', start_time: '10:00',
    end_time: '', duration_minutes: 30, location: '', vehicle_id: '', notes: '',
  });

  useEffect(() => {
    if (dealerId) loadAppointments();
  }, [dealerId, selectedDate]);

  async function loadAppointments() {
    try {
      setLoading(true);
      const weekStart = getWeekStart(selectedDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('dealer_id', dealerId)
        .gte('scheduled_date', localYMD(weekStart))
        .lte('scheduled_date', localYMD(weekEnd))
        .order('scheduled_date').order('start_time');

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  }

  function getWeekStart(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekDays() {
    const start = getWeekStart(selectedDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  async function handleSave() {
    if (!form.title || !form.scheduled_date || !form.start_time) {
      alert('Please fill in title, date, and time');
      return;
    }

    try {
      const startTime = String(form.start_time).slice(0, 5);
      const payload = {
        dealer_id: dealerId,
        ...form,
        start_time: startTime,
        // end_time is a Postgres time column: '' is rejected, so work it out from start + duration.
        end_time: addMinutes(startTime, form.duration_minutes),
        customer_id: form.customer_id ? parseInt(form.customer_id, 10) : null,
        employee_id: form.employee_id ? parseInt(form.employee_id, 10) : null,
        vehicle_id: form.vehicle_id || null,
        customer_name: form.customer_name || null,
        customer_phone: form.customer_phone || null,
        customer_email: form.customer_email || null,
        employee_name: form.employee_name || null,
        description: form.description || null,
        location: form.location || null,
        notes: form.notes || null,
      };

      let error;
      if (editingAppt) {
        payload.updated_at = new Date().toISOString();
        ({ error } = await supabase.from('appointments').update(payload).eq('id', editingAppt.id).eq('dealer_id', dealerId));
      } else {
        ({ error } = await supabase.from('appointments').insert(payload));
      }
      if (error) throw error;

      // Log interaction on the customer's history when a new appointment is booked
      if (!editingAppt && payload.customer_id) {
        const { error: logError } = await supabase.from('customer_interactions').insert({
          dealer_id: dealerId,
          customer_id: payload.customer_id,
          interaction_type: form.appointment_type === 'test_drive' ? 'test_drive' : 'visit',
          summary: `Appointment scheduled: ${form.title} on ${form.scheduled_date} at ${startTime}`,
          employee_id: payload.employee_id,
          employee_name: payload.employee_name,
        });
        if (logError) console.warn('Appointment saved, but logging it to the customer history failed:', logError);
      }

      setShowForm(false);
      setEditingAppt(null);
      resetForm();
      loadAppointments();
    } catch (error) {
      alert('Failed to save appointment: ' + error.message);
    }
  }

  async function updateStatus(id, status) {
    if (status === 'cancelled' && !confirm('Cancel this appointment?')) return;
    const { error } = await supabase.from('appointments').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to update appointment: ' + error.message); return; }
    loadAppointments();
  }

  function resetForm() {
    setForm({
      customer_id: '', customer_name: '', customer_phone: '', customer_email: '',
      employee_id: '', employee_name: '', appointment_type: 'test_drive',
      title: '', description: '', scheduled_date: '', start_time: '10:00',
      end_time: '', duration_minutes: 30, location: '', vehicle_id: '', notes: '',
    });
  }

  function openNewAppt(date) {
    resetForm();
    setForm(f => ({ ...f, scheduled_date: localYMD(date || new Date()) }));
    setEditingAppt(null);
    setShowForm(true);
  }

  function openEdit(appt) {
    setForm({
      customer_id: appt.customer_id || '', customer_name: appt.customer_name || '',
      customer_phone: appt.customer_phone || '', customer_email: appt.customer_email || '',
      employee_id: appt.employee_id || '', employee_name: appt.employee_name || '',
      appointment_type: appt.appointment_type, title: appt.title,
      description: appt.description || '', scheduled_date: appt.scheduled_date,
      start_time: appt.start_time ? String(appt.start_time).slice(0, 5) : '10:00', end_time: appt.end_time || '',
      duration_minutes: appt.duration_minutes || 30, location: appt.location || '',
      vehicle_id: appt.vehicle_id || '', notes: appt.notes || '',
    });
    setEditingAppt(appt);
    setShowForm(true);
  }

  function selectCustomer(c) {
    setForm(f => ({ ...f, customer_id: c.id, customer_name: displayName(c), customer_phone: c.phone || '', customer_email: c.email || '' }));
  }

  const typeColors = {
    test_drive: { bg: '#3b82f620', color: '#3b82f6', label: 'Test Drive' },
    sales_meeting: { bg: '#f9731620', color: '#f97316', label: 'Sales Meeting' },
    delivery: { bg: '#22c55e20', color: '#22c55e', label: 'Delivery' },
    service: { bg: '#8b5cf620', color: '#8b5cf6', label: 'Service' },
    financing: { bg: '#eab30820', color: '#eab308', label: 'Financing' },
    other: { bg: '#71717a20', color: '#71717a', label: 'Other' },
  };

  const statusColors = {
    scheduled: { bg: '#3b82f620', color: '#3b82f6' },
    confirmed: { bg: '#22c55e20', color: '#22c55e' },
    completed: { bg: '#22c55e20', color: '#22c55e' },
    cancelled: { bg: '#ef444420', color: '#ef4444' },
    no_show: { bg: '#f9731620', color: '#f97316' },
  };

  const weekDays = getWeekDays();
  const today = localYMD();
  const selectedDayStr = localYMD(selectedDate);
  const listAppts = view === 'day' ? appointments.filter(a => a.scheduled_date === selectedDayStr) : appointments;

  const todayAppts = appointments.filter(a => a.scheduled_date === today);
  const upcomingAppts = appointments.filter(a => a.scheduled_date >= today && a.status !== 'cancelled');

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>Appointments</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>
            Book test drives, deliveries, and meetings with customers so the whole team can see the schedule.
          </p>
          <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0' }}>
            {todayAppts.length} today | {upcomingAppts.length} upcoming this week. Customers are not sent reminders automatically.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ display: 'flex', backgroundColor: theme.bgCard, borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            {['day', 'week', 'list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                backgroundColor: view === v ? theme.accent : 'transparent', color: view === v ? '#fff' : theme.textSecondary,
              }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <button onClick={() => openNewAppt()} style={{
            padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none',
            borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer',
          }}>+ New Appointment</button>
        </div>
      </div>

      {/* Week Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d); }}
          style={{ padding: '6px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, cursor: 'pointer' }}>←</button>
        <button onClick={() => setSelectedDate(new Date())}
          style={{ padding: '6px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Today</button>
        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d); }}
          style={{ padding: '6px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, cursor: 'pointer' }}>→</button>
        <span style={{ fontSize: '16px', fontWeight: '600' }}>
          {weekDays[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {/* Week View */}
      {view === 'week' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
          {weekDays.map(day => {
            const dateStr = localYMD(day);
            const dayAppts = appointments.filter(a => a.scheduled_date === dateStr);
            const isToday = dateStr === today;

            return (
              <div key={dateStr} style={{
                backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${isToday ? theme.accent : theme.border}`,
                padding: '12px', minHeight: '200px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase' }}>
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: isToday ? theme.accent : theme.text }}>
                      {day.getDate()}
                    </div>
                  </div>
                  <button onClick={() => openNewAppt(day)} title="Add an appointment on this day" style={{
                    width: '24px', height: '24px', borderRadius: '50%', border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent', color: theme.textMuted, cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>+</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {dayAppts.map(appt => {
                    const tc = typeColors[appt.appointment_type] || typeColors.other;
                    return (
                      <div key={appt.id} onClick={() => openEdit(appt)} style={{
                        padding: '6px 8px', borderRadius: '6px', backgroundColor: tc.bg,
                        borderLeft: `3px solid ${tc.color}`, cursor: 'pointer', fontSize: '12px',
                      }}>
                        <div style={{ fontWeight: '600', color: theme.text }}>{appt.start_time?.substring(0, 5)}</div>
                        <div style={{ color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {appt.title}
                        </div>
                        {appt.customer_name && (
                          <div style={{ color: theme.textMuted, fontSize: '11px' }}>{appt.customer_name}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {(view === 'list' || view === 'day') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {listAppts.map(appt => {
            const tc = typeColors[appt.appointment_type] || typeColors.other;
            const sc = statusColors[appt.status] || statusColors.scheduled;
            return (
              <div key={appt.id} style={{
                backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`,
                padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', minWidth: '50px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '600' }}>
                      {new Date(appt.scheduled_date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: '700' }}>
                      {new Date(appt.scheduled_date + 'T00:00').getDate()}
                    </div>
                  </div>
                  <div style={{ width: '1px', height: '40px', backgroundColor: theme.border }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: '600', fontSize: '15px' }}>{appt.title}</span>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: tc.bg, color: tc.color }}>{tc.label}</span>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: sc.bg, color: sc.color }}>{appt.status}</span>
                    </div>
                    <div style={{ color: theme.textSecondary, fontSize: '13px' }}>
                      {appt.start_time?.substring(0, 5)} {appt.end_time ? `- ${appt.end_time.substring(0, 5)}` : `(${appt.duration_minutes}min)`}
                      {appt.customer_name && ` | ${appt.customer_name}`}
                      {appt.employee_name && ` | ${appt.employee_name}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {appt.status === 'scheduled' && (
                    <>
                      <button onClick={() => updateStatus(appt.id, 'confirmed')} title="Mark that the customer confirmed they're coming. Nothing is sent to the customer." style={{ padding: '6px 12px', backgroundColor: '#22c55e20', color: '#22c55e', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Confirm</button>
                      <button onClick={() => updateStatus(appt.id, 'cancelled')} style={{ padding: '6px 12px', backgroundColor: '#ef444420', color: '#ef4444', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                    </>
                  )}
                  {(appt.status === 'scheduled' || appt.status === 'confirmed') && (
                    <button onClick={() => updateStatus(appt.id, 'completed')} style={{ padding: '6px 12px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Complete</button>
                  )}
                  <button onClick={() => openEdit(appt)} style={{ padding: '6px 12px', backgroundColor: theme.bg, color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Edit</button>
                </div>
              </div>
            );
          })}
          {!loading && listAppts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
              <p style={{ fontSize: '16px' }}>{view === 'day' ? 'No appointments on this day' : 'No appointments this week'}</p>
              <p style={{ fontSize: '13px' }}>Click "+ New Appointment" to book one, or use the arrows to look at another week.</p>
            </div>
          )}
        </div>
      )}

      {/* Appointment Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setShowForm(false); setEditingAppt(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '32px', width: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>
              {editingAppt ? 'Edit Appointment' : 'New Appointment'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Type</label>
                  <select value={form.appointment_type} onChange={(e) => {
                    const type = e.target.value;
                    setForm(f => ({ ...f, appointment_type: type, title: f.title || typeColors[type]?.label || '' }));
                  }} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                    <option value="test_drive">Test Drive</option>
                    <option value="sales_meeting">Sales Meeting</option>
                    <option value="delivery">Delivery</option>
                    <option value="service">Service</option>
                    <option value="financing">Financing</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Title</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Customer</label>
                <select value={form.customer_id} onChange={(e) => {
                  const c = (customers || []).find(c => c.id === parseInt(e.target.value));
                  if (c) selectCustomer(c);
                  else setForm(f => ({ ...f, customer_id: '', customer_name: '', customer_phone: '', customer_email: '' }));
                }} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                  <option value="">Select customer...</option>
                  {(customers || []).map(c => <option key={c.id} value={c.id}>{displayName(c)} {c.phone ? `(${c.phone})` : ''}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Assigned To</label>
                <select value={form.employee_id} onChange={(e) => {
                  const emp = (employees || []).find(emp => emp.id === parseInt(e.target.value));
                  setForm(f => ({ ...f, employee_id: e.target.value, employee_name: emp?.name || '' }));
                }} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                  <option value="">Select employee...</option>
                  {(employees || []).filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Date</label>
                  <input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })}
                    style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Start Time</label>
                  <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Duration (min)</label>
                  <select value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                    {[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '4px', color: theme.textSecondary }}>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button onClick={() => { setShowForm(false); setEditingAppt(null); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>
                  {editingAppt ? 'Update' : 'Create'} Appointment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
