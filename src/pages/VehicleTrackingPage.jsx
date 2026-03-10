import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function VehicleTrackingPage() {
  const { theme } = useTheme();
  const { dealerId, inventory } = useStore();
  const [loading, setLoading] = useState(true);
  const [trackers, setTrackers] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedTracker, setSelectedTracker] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [activeTab, setActiveTab] = useState('active');

  const [form, setForm] = useState({
    vehicle_id: '', device_id: '', device_type: 'gps', provider: '',
    geofence_enabled: false, geofence_radius_miles: 50, mileage_limit: ''
  });

  const providers = {
    ituran: { name: 'Ituran', color: '#1e40af' },
    spireon: { name: 'Spireon', color: '#059669' },
    passtime: { name: 'PassTime', color: '#dc2626' },
    manual: { name: 'Manual', color: '#71717a' }
  };

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('vehicle_gps_tracking').select('*').eq('dealer_id', dealerId).order('updated_at', { ascending: false });
    setTrackers(data || []);
    setLoading(false);
  }

  async function loadHistory(trackingId) {
    const { data } = await supabase.from('gps_location_history').select('*').eq('tracking_id', trackingId).order('recorded_at', { ascending: false }).limit(100);
    setHistory(data || []);
    setShowHistoryModal(true);
  }

  const bhphVehicles = (inventory || []).filter(v => v.status === 'BHPH' || v.status === 'In Stock');

  // Stats
  const activeTrackers = trackers.filter(t => t.active);
  const geofenceEnabled = trackers.filter(t => t.geofence_enabled);
  const geofenceAlerts = trackers.filter(t => t.geofence_alert_sent);
  const starterDisabled = trackers.filter(t => t.starter_disabled);
  const recentPings = trackers.filter(t => t.last_ping_at && new Date(t.last_ping_at) > new Date(Date.now() - 24 * 3600000));

  async function handleAddTracker() {
    try {
      const payload = {
        dealer_id: dealerId,
        vehicle_id: form.vehicle_id,
        device_id: form.device_id || null,
        device_type: form.device_type,
        provider: form.provider || null,
        geofence_enabled: form.geofence_enabled,
        geofence_radius_miles: parseFloat(form.geofence_radius_miles) || 50,
        mileage_limit: form.mileage_limit ? parseInt(form.mileage_limit) : null,
        active: true
      };
      const { error } = await supabase.from('vehicle_gps_tracking').insert(payload);
      if (error) throw error;
      setShowAddModal(false);
      setForm({ vehicle_id: '', device_id: '', device_type: 'gps', provider: '', geofence_enabled: false, geofence_radius_miles: 50, mileage_limit: '' });
      loadData();
    } catch (err) { alert('Failed to add tracker: ' + err.message); }
  }

  async function toggleStarter(id, disable) {
    if (!confirm(disable ? 'Disable starter? Vehicle will not start.' : 'Enable starter?')) return;
    await supabase.from('vehicle_gps_tracking').update({ starter_disabled: disable }).eq('id', id);
    loadData();
  }

  async function toggleActive(id, active) {
    await supabase.from('vehicle_gps_tracking').update({ active: !active }).eq('id', id);
    loadData();
  }

  async function updateLocation(id, lat, lng, address) {
    await supabase.from('vehicle_gps_tracking').update({
      current_lat: lat, current_lng: lng, current_address: address, last_ping_at: new Date().toISOString()
    }).eq('id', id);
    // Log history
    await supabase.from('gps_location_history').insert({
      tracking_id: id, dealer_id: dealerId, lat, lng, address, event_type: 'ping'
    });
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Remove GPS tracking for this vehicle?')) return;
    await supabase.from('vehicle_gps_tracking').delete().eq('id', id);
    loadData();
  }

  function timeSince(date) {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const filteredTrackers = activeTab === 'active' ? trackers.filter(t => t.active) :
    activeTab === 'alerts' ? trackers.filter(t => t.geofence_alert_sent || t.mileage_alert_sent) :
    trackers;

  if (loading) return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><div style={{ color: theme.textSecondary }}>Loading...</div></div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Vehicle Tracking</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>GPS tracking, geofencing & starter control for BHPH fleet</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ Add Tracker</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Active Trackers', value: activeTrackers.length, color: '#22c55e' },
          { label: 'Recent Pings (24h)', value: recentPings.length, color: '#3b82f6' },
          { label: 'Geofence Enabled', value: geofenceEnabled.length, color: '#8b5cf6' },
          { label: 'Geofence Alerts', value: geofenceAlerts.length, color: '#ef4444' },
          { label: 'Starter Disabled', value: starterDisabled.length, color: '#f59e0b' },
          { label: 'Total Vehicles', value: trackers.length, color: theme.text }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'active', label: 'Active' }, { id: 'alerts', label: 'Alerts' }, { id: 'all', label: 'All' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', backgroundColor: activeTab === tab.id ? theme.accentBg : 'transparent', border: 'none', borderBottom: activeTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent', color: activeTab === tab.id ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>{tab.label}</button>
        ))}
      </div>

      {/* Tracker Cards */}
      {filteredTrackers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📍</div>
          <p>No {activeTab === 'alerts' ? 'alerts' : 'trackers'} found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '12px' }}>
          {filteredTrackers.map(tracker => {
            const v = (inventory || []).find(i => i.id === tracker.vehicle_id);
            const prov = providers[tracker.provider] || providers.manual;
            const hasAlert = tracker.geofence_alert_sent || tracker.mileage_alert_sent;

            return (
              <div key={tracker.id} style={{ backgroundColor: theme.bgCard, border: `1px solid ${hasAlert ? '#ef4444' : theme.border}`, borderRadius: '12px', padding: '20px' }}>
                {/* Vehicle Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>
                      {v ? `${v.year} ${v.make} ${v.model}` : tracker.vehicle_id}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: '13px', display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {tracker.device_id && <span>Device: {tracker.device_id}</span>}
                      <span style={{ padding: '1px 6px', borderRadius: '4px', backgroundColor: `${prov.color}20`, color: prov.color, fontSize: '11px' }}>{prov.name}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {tracker.ignition_on && <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} title="Ignition On" />}
                    <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', backgroundColor: tracker.active ? 'rgba(34,197,94,0.15)' : 'rgba(113,113,122,0.15)', color: tracker.active ? '#22c55e' : '#71717a' }}>
                      {tracker.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Location */}
                <div style={{ backgroundColor: theme.bg, borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>Last Known Location</div>
                      <div style={{ fontSize: '14px', color: theme.text, fontWeight: '500', marginTop: '2px' }}>
                        {tracker.current_address || (tracker.current_lat ? `${tracker.current_lat}, ${tracker.current_lng}` : 'No location data')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>Last Ping</div>
                      <div style={{ fontSize: '13px', color: tracker.last_ping_at && new Date(tracker.last_ping_at) > new Date(Date.now() - 3600000) ? '#22c55e' : '#f59e0b', fontWeight: '600' }}>
                        {timeSince(tracker.last_ping_at)}
                      </div>
                    </div>
                  </div>
                  {tracker.speed > 0 && <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>Speed: {tracker.speed} mph</div>}
                </div>

                {/* Alerts */}
                {hasAlert && (
                  <div style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
                    {tracker.geofence_alert_sent && <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>⚠ Geofence violation detected</div>}
                    {tracker.mileage_alert_sent && <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>⚠ Mileage limit exceeded</div>}
                  </div>
                )}

                {/* Info Row */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '12px', color: theme.textSecondary }}>
                  {tracker.geofence_enabled && <span>📍 Geofence: {tracker.geofence_radius_miles}mi</span>}
                  {tracker.last_known_mileage && <span>🛞 {tracker.last_known_mileage.toLocaleString()} mi</span>}
                  {tracker.mileage_limit && <span>📏 Limit: {tracker.mileage_limit.toLocaleString()} mi</span>}
                  {tracker.battery_level !== null && <span>🔋 {tracker.battery_level}%</span>}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => { setSelectedTracker(tracker); loadHistory(tracker.id); }} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#3b82f6', cursor: 'pointer', fontSize: '12px' }}>History</button>
                  <button onClick={() => toggleStarter(tracker.id, !tracker.starter_disabled)} style={{ padding: '6px 12px', backgroundColor: tracker.starter_disabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '6px', color: tracker.starter_disabled ? '#22c55e' : '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    {tracker.starter_disabled ? 'Enable Starter' : 'Kill Starter'}
                  </button>
                  <button onClick={() => toggleActive(tracker.id, tracker.active)} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, cursor: 'pointer', fontSize: '12px' }}>
                    {tracker.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(tracker.id)} style={{ padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Tracker Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '500px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>Add GPS Tracker</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Vehicle *</label>
                <select value={form.vehicle_id} onChange={e => setForm({ ...form, vehicle_id: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                  <option value="">Select vehicle...</option>
                  {bhphVehicles.filter(v => !trackers.some(t => t.vehicle_id === v.id)).map(v => (
                    <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} [{v.status}]</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Device ID</label>
                  <input value={form.device_id} onChange={e => setForm({ ...form, device_id: e.target.value })} placeholder="GPS device serial #" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Provider</label>
                  <select value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }}>
                    <option value="">Select...</option>
                    {Object.entries(providers).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Geofence Radius (miles)</label>
                  <input type="number" value={form.geofence_radius_miles} onChange={e => setForm({ ...form, geofence_radius_miles: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Mileage Limit</label>
                  <input type="number" value={form.mileage_limit} onChange={e => setForm({ ...form, mileage_limit: e.target.value })} placeholder="Optional" style={{ width: '100%', padding: '10px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text }} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={form.geofence_enabled} onChange={e => setForm({ ...form, geofence_enabled: e.target.checked })} style={{ accentColor: theme.accent }} />
                <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Enable geofence alerts</span>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddTracker} disabled={!form.vehicle_id} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600', opacity: form.vehicle_id ? 1 : 0.5 }}>Add Tracker</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedTracker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>Location History</h2>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>No location history recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {history.map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div>
                      <div style={{ color: theme.text, fontSize: '13px' }}>{h.address || `${h.lat}, ${h.lng}`}</div>
                      <div style={{ color: theme.textMuted, fontSize: '11px' }}>{h.event_type} {h.speed ? `• ${h.speed} mph` : ''}</div>
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>{new Date(h.recorded_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowHistoryModal(false)} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
