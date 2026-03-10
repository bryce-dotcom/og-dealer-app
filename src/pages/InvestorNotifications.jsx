import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function InvestorNotifications() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // all, unread, deposits, vehicles, distributions

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
        return { icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z', color: type.includes('failed') ? 'text-red-400 bg-red-500/20' : 'text-blue-400 bg-blue-500/20' };
      case 'withdrawal_completed':
      case 'withdrawal_failed':
        return { icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z', color: type.includes('failed') ? 'text-red-400 bg-red-500/20' : 'text-green-400 bg-green-500/20' };
      case 'vehicle_purchased':
      case 'vehicle_sold':
        return { icon: 'M13 10V3L4 14h7v7l9-11h-7z', color: 'text-amber-400 bg-amber-500/20' };
      case 'distribution_ready':
      case 'distribution_paid':
        return { icon: 'M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z', color: 'text-green-400 bg-green-500/20' };
      case 'report_available':
        return { icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', color: 'text-purple-400 bg-purple-500/20' };
      case 'accreditation_approved':
        return { icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z', color: 'text-green-400 bg-green-500/20' };
      case 'accreditation_rejected':
        return { icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-red-400 bg-red-500/20' };
      case 'announcement':
        return { icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z', color: 'text-blue-400 bg-blue-500/20' };
      default:
        return { icon: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z', color: 'text-slate-400 bg-slate-500/20' };
    }
  }

  function getFilterTypes(filter) {
    switch (filter) {
      case 'unread': return null; // special handling
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-3 px-3 py-1 bg-blue-600 text-white text-lg rounded-full font-bold">
                  {unreadCount}
                </span>
              )}
            </h1>
            <p className="text-blue-200">Stay updated on your investments</p>
          </div>
          <div className="flex gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm font-semibold transition"
              >
                Mark All Read
              </button>
            )}
            <button
              onClick={() => navigate('/investor/dashboard')}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              ← Dashboard
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
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
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                filter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.map(notif => {
            const { icon, color } = getNotificationIcon(notif.type);
            return (
              <div
                key={notif.id}
                className={`p-5 rounded-xl border transition cursor-pointer ${
                  notif.read
                    ? 'bg-white/5 border-white/10 hover:border-white/20'
                    : 'bg-white/10 border-blue-500/30 hover:border-blue-500/50'
                }`}
                onClick={() => {
                  if (!notif.read) markAsRead(notif.id);
                  if (notif.action_url) navigate(notif.action_url);
                }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={icon} clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`font-semibold ${notif.read ? 'text-slate-300' : 'text-white'}`}>
                        {notif.title}
                      </h3>
                      <div className="flex items-center gap-2">
                        {!notif.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                        <span className="text-slate-500 text-xs whitespace-nowrap">{timeAgo(notif.created_at)}</span>
                      </div>
                    </div>
                    <p className={`text-sm ${notif.read ? 'text-slate-500' : 'text-slate-300'}`}>
                      {notif.message}
                    </p>
                    {notif.action_url && (
                      <div className="mt-2 text-blue-400 text-xs font-semibold">
                        View details →
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                    className="text-slate-600 hover:text-slate-400 flex-shrink-0 p-1"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredNotifications.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-16 h-16 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-slate-400 text-lg">
              {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              {filter === 'unread' ? 'You have no unread notifications' : "You'll be notified of important events"}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
