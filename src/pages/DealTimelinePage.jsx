import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function DealTimelinePage() {
  const { theme } = useTheme();
  const { dealerId, deals } = useStore();
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeView, setActiveView] = useState('pipeline');
  const [eventFilter, setEventFilter] = useState('all');

  const [eventForm, setEventForm] = useState({
    deal_id: '', event_type: 'note_added', title: '', description: ''
  });

  const eventTypes = {
    created: { label: 'Deal Created', icon: '🆕', color: '#3b82f6' },
    status_changed: { label: 'Status Changed', icon: '🔄', color: '#8b5cf6' },
    price_changed: { label: 'Price Changed', icon: '💰', color: '#f59e0b' },
    payment_received: { label: 'Payment Received', icon: '💵', color: '#22c55e' },
    document_generated: { label: 'Document Generated', icon: '📄', color: '#06b6d4' },
    document_signed: { label: 'Document Signed', icon: '✍️', color: '#14b8a6' },
    trade_in_added: { label: 'Trade-In Added', icon: '🔄', color: '#ec4899' },
    financing_approved: { label: 'Financing Approved', icon: '✅', color: '#22c55e' },
    financing_denied: { label: 'Financing Denied', icon: '❌', color: '#ef4444' },
    customer_changed: { label: 'Customer Updated', icon: '👤', color: '#a855f7' },
    note_added: { label: 'Note Added', icon: '📝', color: '#71717a' },
    appointment_set: { label: 'Appointment Set', icon: '📅', color: '#3b82f6' },
    test_drive: { label: 'Test Drive', icon: '🚗', color: '#f97316' },
    delivery: { label: 'Delivery', icon: '🎉', color: '#22c55e' },
    title_sent: { label: 'Title Sent', icon: '📮', color: '#06b6d4' },
    title_received: { label: 'Title Received', icon: '📬', color: '#14b8a6' },
    cancelled: { label: 'Cancelled', icon: '🚫', color: '#ef4444' },
    custom: { label: 'Custom', icon: '📌', color: '#71717a' }
  };

  const dealStages = [
    { key: 'Lead', color: '#3b82f6' },
    { key: 'Negotiation', color: '#f59e0b' },
    { key: 'Financing', color: '#8b5cf6' },
    { key: 'Documents', color: '#06b6d4' },
    { key: 'Sold', color: '#22c55e' },
    { key: 'Delivered', color: '#14b8a6' }
  ];

  useEffect(() => { if (dealerId) loadTimeline(); }, [dealerId]);

  async function loadTimeline() {
    setLoading(true);
    const { data } = await supabase.from('deal_timeline').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }).limit(200);
    setTimeline(data || []);
    setLoading(false);
  }

  // Pipeline counts
  const dealsByStage = dealStages.map(stage => ({
    ...stage,
    deals: (deals || []).filter(d => d.status === stage.key),
    count: (deals || []).filter(d => d.status === stage.key).length
  }));

  const totalDeals = (deals || []).length;
  const activeDeals = (deals || []).filter(d => !['Sold', 'Delivered', 'Cancelled'].includes(d.status)).length;
  const recentEvents = timeline.filter(t => new Date(t.created_at) > new Date(Date.now() - 7 * 86400000)).length;
  const todayEvents = timeline.filter(t => new Date(t.created_at).toDateString() === new Date().toDateString()).length;

  let filteredTimeline = timeline;
  if (selectedDeal !== 'all') filteredTimeline = filteredTimeline.filter(t => t.deal_id === parseInt(selectedDeal));
  if (eventFilter !== 'all') filteredTimeline = filteredTimeline.filter(t => t.event_type === eventFilter);

  async function handleAddEvent() {
    try {
      await supabase.rpc('log_deal_event', {
        p_dealer_id: dealerId,
        p_deal_id: parseInt(eventForm.deal_id),
        p_event_type: eventForm.event_type,
        p_title: eventForm.title,
        p_description: eventForm.description || null
      });
      setShowAddModal(false);
      setEventForm({ deal_id: '', event_type: 'note_added', title: '', description: '' });
      loadTimeline();
    } catch (err) { alert('Failed to add event: ' + err.message); }
  }

  function groupByDate(events) {
    const groups = {};
    events.forEach(e => {
      const date = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(e);
    });
    return groups;
  }

  const groupedTimeline = groupByDate(filteredTimeline);

  if (loading) return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><div style={{ color: theme.textSecondary }}>Loading...</div></div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Deal Activity</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Pipeline view & deal lifecycle tracking</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ Log Event</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Deals', value: totalDeals, color: theme.text },
          { label: 'Active', value: activeDeals, color: '#3b82f6' },
          { label: 'Events (7d)', value: recentEvents, color: '#8b5cf6' },
          { label: 'Today', value: todayEvents, color: theme.accent }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'pipeline', label: 'Pipeline' }, { id: 'timeline', label: 'Timeline' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveView(tab.id)} style={{ padding: '10px 20px', backgroundColor: activeView === tab.id ? theme.accentBg : 'transparent', border: 'none', borderBottom: activeView === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent', color: activeView === tab.id ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>{tab.label}</button>
        ))}
      </div>

      {/* Pipeline View */}
      {activeView === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dealStages.length}, 1fr)`, gap: '12px' }}>
          {dealsByStage.map(stage => (
            <div key={stage.key} style={{ backgroundColor: theme.bg, borderRadius: '12px', padding: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                <span style={{ color: stage.color, fontWeight: '700', fontSize: '13px' }}>{stage.key}</span>
                <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: `${stage.color}20`, color: stage.color, fontSize: '12px', fontWeight: '700' }}>{stage.count}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '500px', overflowY: 'auto' }}>
                {stage.deals.map(deal => {
                  const recentEvent = timeline.find(t => t.deal_id === deal.id);
                  return (
                    <div key={deal.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px', cursor: 'pointer' }} onClick={() => { setSelectedDeal(String(deal.id)); setActiveView('timeline'); }}>
                      <div style={{ color: theme.text, fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}>
                        {deal.vehicle_info || deal.customer_name || `Deal #${deal.id}`}
                      </div>
                      {deal.customer_name && <div style={{ fontSize: '11px', color: theme.textSecondary }}>{deal.customer_name}</div>}
                      {deal.sale_price && <div style={{ fontSize: '12px', color: theme.accent, fontWeight: '600', marginTop: '4px' }}>${parseFloat(deal.sale_price).toLocaleString()}</div>}
                      {recentEvent && (
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{eventTypes[recentEvent.event_type]?.icon || '📌'}</span>
                          <span>{recentEvent.title}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {stage.deals.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted, fontSize: '12px' }}>No deals</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline View */}
      {activeView === 'timeline' && (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <select value={selectedDeal} onChange={e => setSelectedDeal(e.target.value)} style={{ padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
              <option value="all">All Deals</option>
              {(deals || []).map(d => <option key={d.id} value={d.id}>Deal #{d.id} {d.customer_name ? `- ${d.customer_name}` : ''}</option>)}
            </select>
            <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} style={{ padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
              <option value="all">All Events</option>
              {Object.entries(eventTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>

          {filteredTimeline.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
              <p>No timeline events found. Events are logged as deals progress.</p>
            </div>
          ) : (
            <div>
              {Object.entries(groupedTimeline).map(([date, events]) => (
                <div key={date} style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{date}</div>
                  <div style={{ borderLeft: `2px solid ${theme.border}`, paddingLeft: '20px', marginLeft: '8px' }}>
                    {events.map(event => {
                      const et = eventTypes[event.event_type] || eventTypes.custom;
                      const deal = (deals || []).find(d => d.id === event.deal_id);
                      return (
                        <div key={event.id} style={{ position: 'relative', marginBottom: '12px' }}>
                          {/* Dot */}
                          <div style={{ position: 'absolute', left: '-27px', top: '8px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: et.color, border: `2px solid ${theme.bgCard}` }} />

                          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '16px' }}>{et.icon}</span>
                                <div>
                                  <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{event.title}</span>
                                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', backgroundColor: `${et.color}20`, color: et.color, marginLeft: '8px' }}>{et.label}</span>
                                </div>
                              </div>
                              <span style={{ fontSize: '12px', color: theme.textMuted }}>{new Date(event.created_at).toLocaleTimeString()}</span>
                            </div>
                            {event.description && <div style={{ color: theme.textSecondary, fontSize: '13px', marginTop: '6px' }}>{event.description}</div>}
                            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px', color: theme.textMuted }}>
                              {deal && <span>Deal #{event.deal_id} {deal.customer_name ? `• ${deal.customer_name}` : ''}</span>}
                              {event.employee_name && <span>By: {event.employee_name}</span>}
                              {event.old_value && event.new_value && <span>{event.old_value} → {event.new_value}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '500px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>Log Deal Event</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Deal *</label>
                <select value={eventForm.deal_id} onChange={e => setEventForm({ ...eventForm, deal_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">Select deal...</option>
                  {(deals || []).map(d => <option key={d.id} value={d.id}>Deal #{d.id} {d.customer_name ? `- ${d.customer_name}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Event Type</label>
                <select value={eventForm.event_type} onChange={e => setEventForm({ ...eventForm, event_type: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  {Object.entries(eventTypes).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Title *</label>
                <input value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} placeholder="e.g., Customer approved for financing" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Description</label>
                <textarea value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={3} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddEvent} disabled={!eventForm.deal_id || !eventForm.title} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: eventForm.deal_id && eventForm.title ? 1 : 0.5 }}>Log Event</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
