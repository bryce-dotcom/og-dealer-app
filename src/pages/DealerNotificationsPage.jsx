import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function DealerNotificationsPage() {
  const navigate = useNavigate();
  const { dealerId } = useStore();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (dealerId) loadNotifications();
  }, [dealerId]);

  async function loadNotifications() {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('dealer_notifications')
        .select('*')
        .eq('dealer_id', dealerId)
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(200);
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id) {
    await supabase.from('dealer_notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    await supabase.from('dealer_notifications').update({ read: true, read_at: new Date().toISOString() }).in('id', unread);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function dismiss(id) {
    await supabase.from('dealer_notifications').update({ dismissed: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  function getTypeConfig(type) {
    const configs = {
      payment_due: { icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: '#f97316', label: 'Payment Due' },
      payment_overdue: { icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: '#ef4444', label: 'Overdue' },
      payment_received: { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#22c55e', label: 'Payment' },
      deal_created: { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: '#3b82f6', label: 'Deal' },
      deal_status_changed: { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: '#3b82f6', label: 'Deal' },
      deal_document_ready: { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: '#3b82f6', label: 'Document' },
      appointment_upcoming: { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: '#8b5cf6', label: 'Appointment' },
      appointment_confirmed: { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: '#22c55e', label: 'Confirmed' },
      appointment_cancelled: { icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: '#ef4444', label: 'Cancelled' },
      inventory_low: { icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', color: '#f97316', label: 'Inventory' },
      inventory_aged: { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', color: '#f97316', label: 'Aged' },
      title_deadline: { icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', color: '#ef4444', label: 'Title' },
      compliance_alert: { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', color: '#ef4444', label: 'Compliance' },
      esignature_completed: { icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#22c55e', label: 'Signed' },
      esignature_declined: { icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#ef4444', label: 'Declined' },
      sms_received: { icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', color: '#3b82f6', label: 'SMS' },
      customer_inquiry: { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: '#8b5cf6', label: 'Customer' },
      system: { icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: '#71717a', label: 'System' },
      announcement: { icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z', color: '#3b82f6', label: 'News' },
    };
    return configs[type] || configs.system;
  }

  function getFilterTypes() {
    switch (filter) {
      case 'unread': return null;
      case 'payments': return ['payment_due', 'payment_overdue', 'payment_received'];
      case 'deals': return ['deal_created', 'deal_status_changed', 'deal_document_ready', 'esignature_completed', 'esignature_declined'];
      case 'appointments': return ['appointment_upcoming', 'appointment_confirmed', 'appointment_cancelled'];
      case 'urgent': return null;
      default: return null;
    }
  }

  function timeAgo(dateStr) {
    const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  const filterTypes = getFilterTypes();
  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'urgent') return n.priority === 'urgent' || n.priority === 'high';
    if (filterTypes) return filterTypes.includes(n.type);
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;
  const urgentCount = notifications.filter(n => !n.read && (n.priority === 'urgent' || n.priority === 'high')).length;

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
            Notifications
            {unreadCount > 0 && (
              <span style={{ marginLeft: '12px', padding: '4px 12px', backgroundColor: theme.accent, color: '#fff', borderRadius: '12px', fontSize: '14px', fontWeight: '700' }}>
                {unreadCount}
              </span>
            )}
          </h1>
          {urgentCount > 0 && (
            <p style={{ color: '#ef4444', fontSize: '14px', margin: '4px 0 0', fontWeight: '600' }}>
              {urgentCount} urgent notification{urgentCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{ padding: '8px 16px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>
            Mark All Read
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'urgent', label: 'Urgent' },
          { id: 'payments', label: 'Payments' },
          { id: 'deals', label: 'Deals' },
          { id: 'appointments', label: 'Appointments' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600',
            backgroundColor: filter === f.id ? theme.accent : theme.bgCard,
            color: filter === f.id ? '#fff' : theme.textSecondary,
          }}>{f.label}</button>
        ))}
      </div>

      {/* Notifications */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filtered.map(notif => {
          const config = getTypeConfig(notif.type);
          const isUrgent = notif.priority === 'urgent' || notif.priority === 'high';

          return (
            <div key={notif.id} onClick={() => {
              if (!notif.read) markAsRead(notif.id);
              if (notif.action_url) navigate(notif.action_url);
            }} style={{
              padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
              backgroundColor: notif.read ? theme.bgCard : theme.accentBg,
              border: `1px solid ${isUrgent && !notif.read ? '#ef444450' : theme.border}`,
              display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                backgroundColor: `${config.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" fill="none" stroke={config.color} strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
                </svg>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: notif.read ? '500' : '700', fontSize: '14px' }}>{notif.title}</span>
                    {!notif.read && <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: theme.accent }} />}
                    {isUrgent && (
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', backgroundColor: '#ef444420', color: '#ef4444' }}>URGENT</span>
                    )}
                  </div>
                  <span style={{ color: theme.textMuted, fontSize: '12px', flexShrink: 0 }}>{timeAgo(notif.created_at)}</span>
                </div>
                <p style={{ color: theme.textSecondary, fontSize: '13px', margin: 0, lineHeight: '1.4' }}>{notif.message}</p>
              </div>

              <button onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                style={{ padding: '4px', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', flexShrink: 0 }} title="Dismiss">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
          <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', opacity: 0.5 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p style={{ fontSize: '16px' }}>{filter === 'unread' ? 'All caught up!' : 'No notifications'}</p>
        </div>
      )}
    </div>
  );
}
