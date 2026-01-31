import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function StateUpdatesPage() {
  const { dealer } = useStore();
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState(null);

  const theme = {
    bg: '#09090b',
    bgCard: '#18181b',
    border: '#27272a',
    text: '#ffffff',
    textMuted: '#a1a1aa',
    accent: '#f97316'
  };

  const updateTypeColors = {
    new_form: { bg: '#166534', label: 'New Form' },
    form_update: { bg: '#1e40af', label: 'Form Update' },
    regulation_change: { bg: '#c2410c', label: 'Regulation Change' },
    deadline_change: { bg: '#dc2626', label: 'Deadline Change' },
    info: { bg: '#6b7280', label: 'Info' }
  };

  const importanceColors = {
    low: { bg: '#374151', label: 'Low' },
    normal: { bg: '#4b5563', label: 'Normal' },
    high: { bg: '#b45309', label: 'High' },
    critical: { bg: '#dc2626', label: 'Critical' }
  };

  useEffect(() => {
    loadUpdates();
  }, []);

  const loadUpdates = async () => {
    setLoading(true);
    console.log('StateUpdatesPage: Loading updates...');
    try {
      const { data, error } = await supabase
        .from('state_updates')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('StateUpdatesPage: Query result:', { data, error, count: data?.length });
      if (error) throw error;
      setUpdates(data || []);
    } catch (err) {
      console.error('Failed to load updates:', err);
      showToast('Failed to load updates', 'error');
    }
    setLoading(false);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const markAsRead = async (id) => {
    try {
      const { error } = await supabase
        .from('state_updates')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setUpdates(updates.map(u => u.id === id ? { ...u, is_read: true } : u));
    } catch (err) {
      showToast('Failed to mark as read', 'error');
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = filteredUpdates.filter(u => !u.is_read).map(u => u.id);
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from('state_updates')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds);

      if (error) throw error;
      setUpdates(updates.map(u => unreadIds.includes(u.id) ? { ...u, is_read: true } : u));
      showToast(`Marked ${unreadIds.length} updates as read`);
    } catch (err) {
      showToast('Failed to mark all as read', 'error');
    }
  };

  const deleteUpdate = async (id) => {
    if (!confirm('Delete this update?')) return;
    try {
      const { error } = await supabase
        .from('state_updates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setUpdates(updates.filter(u => u.id !== id));
      showToast('Update deleted');
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  // Get unique states from updates
  const states = [...new Set(updates.map(u => u.state))].sort();
  const unreadCount = updates.filter(u => !u.is_read).length;

  // Filter updates
  let filteredUpdates = updates;
  if (stateFilter !== 'all') {
    filteredUpdates = filteredUpdates.filter(u => u.state === stateFilter);
  }
  if (statusFilter === 'unread') {
    filteredUpdates = filteredUpdates.filter(u => !u.is_read);
  }

  const cardStyle = {
    backgroundColor: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: '20px',
    marginBottom: '16px'
  };

  const btnPrimary = {
    padding: '8px 16px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  };

  const btnSecondary = {
    padding: '8px 16px',
    backgroundColor: '#3f3f46',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer'
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>State Updates</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0 0' }}>
            Regulatory changes and form updates by state
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} style={btnSecondary}>
              Mark All Read ({unreadCount})
            </button>
          )}
          <button onClick={loadUpdates} style={btnSecondary}>Refresh</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Status Tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { id: 'all', label: 'All', count: updates.length },
            { id: 'unread', label: 'Unread', count: unreadCount }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                backgroundColor: statusFilter === tab.id ? theme.accent : '#3f3f46',
                color: '#fff'
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        <div style={{ borderLeft: `1px solid ${theme.border}`, height: '24px' }} />

        {/* State Filter */}
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            backgroundColor: '#3f3f46',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px'
          }}
        >
          <option value="all">All States ({updates.length})</option>
          {states.map(state => (
            <option key={state} value={state}>
              {state} ({updates.filter(u => u.state === state).length})
            </option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>
          Loading updates...
        </div>
      )}

      {/* Updates List */}
      {!loading && filteredUpdates.length > 0 && (
        <div>
          {filteredUpdates.map(update => {
            const typeInfo = updateTypeColors[update.update_type] || updateTypeColors.info;
            const importanceInfo = importanceColors[update.importance] || importanceColors.normal;
            const showImportance = update.importance === 'high' || update.importance === 'critical';

            return (
              <div
                key={update.id}
                style={{
                  ...cardStyle,
                  opacity: update.is_read ? 0.7 : 1,
                  borderLeftWidth: '4px',
                  borderLeftColor: update.is_read ? theme.border : theme.accent
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{
                        padding: '3px 10px',
                        backgroundColor: '#3f3f46',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {update.state}
                      </span>
                      <span style={{
                        padding: '3px 10px',
                        backgroundColor: typeInfo.bg,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        {typeInfo.label}
                      </span>
                      {showImportance && (
                        <span style={{
                          padding: '3px 10px',
                          backgroundColor: importanceInfo.bg,
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          {importanceInfo.label}
                        </span>
                      )}
                      {!update.is_read && (
                        <span style={{ width: '8px', height: '8px', backgroundColor: theme.accent, borderRadius: '50%' }} />
                      )}
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>{update.title}</h3>
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: '12px', whiteSpace: 'nowrap' }}>
                    {new Date(update.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Summary */}
                {update.summary && (
                  <p style={{ color: theme.textMuted, fontSize: '14px', lineHeight: '1.5', margin: '0 0 12px 0' }}>
                    {update.summary}
                  </p>
                )}

                {/* Forms Affected */}
                {update.forms_affected && update.forms_affected.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: theme.textMuted, marginRight: '8px' }}>Forms affected:</span>
                    {update.forms_affected.map((form, idx) => (
                      <span key={idx} style={{
                        padding: '2px 8px',
                        backgroundColor: '#27272a',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        marginRight: '4px'
                      }}>
                        {form}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: `1px solid ${theme.border}` }}>
                  <div>
                    {update.source_url && (
                      <a
                        href={update.source_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#3b82f6', fontSize: '12px', textDecoration: 'none' }}
                      >
                        View Source
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!update.is_read && (
                      <button
                        onClick={() => markAsRead(update.id)}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#22c55e',
                          color: '#000',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        Mark Read
                      </button>
                    )}
                    <button
                      onClick={() => deleteUpdate(update.id)}
                      style={{
                        padding: '4px 12px',
                        backgroundColor: 'transparent',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredUpdates.length === 0 && (
        <div style={{
          ...cardStyle,
          textAlign: 'center',
          padding: '60px 40px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Updates Found</h3>
          <p style={{ color: theme.textMuted, fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
            {statusFilter === 'unread'
              ? 'All updates have been read.'
              : 'Run "Check for Updates" on a state in the Form Library to find regulatory changes and new forms.'}
          </p>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: toast.type === 'error' ? '#ef4444' : '#22c55e',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          zIndex: 100
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
