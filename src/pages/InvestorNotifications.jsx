import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';

const cardStyle = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };

export default function InvestorNotifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/investor/login'); return; }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setInvestor(investorData);

      const { data: notifData } = await supabase
        .from('investor_notifications')
        .select('*')
        .eq('investor_id', investorData.id)
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(100);

      setNotifications(notifData || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id) {
    const { error } = await supabase
      .from('investor_notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n));
    }
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    const { error } = await supabase
      .from('investor_notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .in('id', unreadIds);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() })));
    }
  }

  async function dismissNotification(id) {
    const { error } = await supabase
      .from('investor_notifications')
      .update({ dismissed: true })
      .eq('id', id);

    if (!error) {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'deposit_confirmed':
      case 'deposit_failed':
        return { icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z', color: type.includes('failed') ? '#dc2626' : '#3b82f6', bg: type.includes('failed') ? '#fef2f2' : '#eff6ff' };
      case 'withdrawal_completed':
      case 'withdrawal_failed':
        return { icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z', color: type.includes('failed') ? '#dc2626' : '#059669', bg: type.includes('failed') ? '#fef2f2' : '#ecfdf5' };
      case 'vehicle_purchased':
      case 'vehicle_sold':
        return { icon: 'M13 10V3L4 14h7v7l9-11h-7z', color: '#d97706', bg: '#fffbeb' };
      case 'distribution_ready':
      case 'distribution_paid':
        return { icon: 'M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z', color: '#059669', bg: '#ecfdf5' };
      case 'report_available':
        return { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: '#7c3aed', bg: '#f5f3ff' };
      case 'accreditation_approved':
        return { icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', color: '#059669', bg: '#ecfdf5' };
      case 'accreditation_rejected':
        return { icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: '#dc2626', bg: '#fef2f2' };
      case 'announcement':
        return { icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z', color: '#3b82f6', bg: '#eff6ff' };
      default:
        return { icon: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z', color: '#6b7280', bg: '#f3f4f6' };
    }
  }

  function getFilterTypes(filter) {
    switch (filter) {
      case 'unread': return null;
      case 'deposits': return ['deposit_confirmed', 'deposit_failed', 'withdrawal_completed', 'withdrawal_failed'];
      case 'vehicles': return ['vehicle_purchased', 'vehicle_sold'];
      case 'distributions': return ['distribution_ready', 'distribution_paid'];
      default: return null;
    }
  }

  function timeAgo(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  if (loading) {
    return (
      <InvestorLayout title="Notifications">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
        </div>
      </InvestorLayout>
    );
  }

  const filterTypes = getFilterTypes(filter);
  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filterTypes) return filterTypes.includes(n.type);
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <InvestorLayout
      title={<span>Notifications{unreadCount > 0 && <span style={{ marginLeft: 12, padding: '4px 12px', backgroundColor: '#111827', color: '#fff', fontSize: 16, borderRadius: 999, fontWeight: 700 }}>{unreadCount}</span>}</span>}
      subtitle="Stay updated on your investments"
    >

      {/* Action bar */}
      {unreadCount > 0 && (
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <button
            onClick={markAllAsRead}
            style={{ padding: '8px 16px', backgroundColor: '#eff6ff', color: '#3b82f6', borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}
          >
            Mark All Read
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'deposits', label: 'Deposits' },
          { id: 'vehicles', label: 'Vehicles' },
          { id: 'distributions', label: 'Distributions' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
              backgroundColor: filter === f.id ? '#111827' : '#f3f4f6',
              color: filter === f.id ? '#fff' : '#6b7280',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredNotifications.map(notif => {
          const { icon, color, bg } = getNotificationIcon(notif.type);
          return (
            <div
              key={notif.id}
              onClick={() => {
                if (!notif.read) markAsRead(notif.id);
                if (notif.action_url) navigate(notif.action_url);
              }}
              style={{
                padding: 20, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                backgroundColor: notif.read ? '#fff' : '#f8fafc',
                border: notif.read ? '1px solid #e5e7eb' : '1px solid #bfdbfe',
                boxShadow: notif.read ? 'none' : '0 1px 3px rgba(59,130,246,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: bg }}>
                  <svg style={{ width: 20, height: 20, color }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d={icon} clipRule="evenodd" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h3 style={{ fontWeight: 600, color: notif.read ? '#6b7280' : '#111827', margin: 0, fontSize: 14 }}>
                      {notif.title}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!notif.read && (
                        <div style={{ width: 8, height: 8, backgroundColor: '#3b82f6', borderRadius: '50%' }} />
                      )}
                      <span style={{ color: '#9ca3af', fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(notif.created_at)}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: notif.read ? '#9ca3af' : '#6b7280', margin: 0 }}>
                    {notif.message}
                  </p>
                  {notif.action_url && (
                    <div style={{ marginTop: 8, color: '#3b82f6', fontSize: 12, fontWeight: 600 }}>
                      View details &rarr;
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                  style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 4 }}
                  title="Dismiss"
                >
                  <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredNotifications.length === 0 && (
        <div style={{ textAlign: 'center', padding: 64 }}>
          <svg style={{ width: 64, height: 64, margin: '0 auto 16px', color: '#d1d5db' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p style={{ color: '#6b7280', fontSize: 18 }}>
            {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 4 }}>
            {filter === 'unread' ? 'You have no unread notifications' : "You'll be notified of important events"}
          </p>
        </div>
      )}

    </InvestorLayout>
  );
}
