import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function TimeClockPage() {
  const { dealerId, employees, refreshEmployees } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };
  
  const [timeEntries, setTimeEntries] = useState([]);
  const [activeClocks, setActiveClocks] = useState({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showPTOModal, setShowPTOModal] = useState(false);
  const [ptoRequests, setPtoRequests] = useState([]);
  const [ptoForm, setPtoForm] = useState({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
  const [submittingPTO, setSubmittingPTO] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (dealerId) { fetchTimeEntries(); fetchPTORequests(); }
  }, [dealerId]);

  async function fetchTimeEntries() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('time_clock').select('*, employees(name)').eq('dealer_id', dealerId)
      .order('clock_in', { ascending: false }).limit(100);
    if (fetchError) setError('Failed: ' + fetchError.message);
    else if (data) {
      setTimeEntries(data);
      const active = {};
      data.forEach(entry => { if (!entry.clock_out) active[entry.employee_id] = entry; });
      setActiveClocks(active);
    }
    setLoading(false);
  }

  async function fetchPTORequests() {
    const { data } = await supabase.from('time_off_requests').select('*, employees(name)')
      .eq('dealer_id', dealerId).order('created_at', { ascending: false });
    if (data) setPtoRequests(data);
  }

  async function getLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve({ lat: null, lng: null, address: 'Unavailable' }); return; }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude, lng = pos.coords.longitude;
          let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
            const data = await res.json();
            if (data.display_name) address = data.display_name.split(', ').slice(0, 2).join(', ');
          } catch (e) {}
          resolve({ lat, lng, address });
        },
        () => resolve({ lat: null, lng: null, address: 'Denied' }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function clockIn(employeeId) {
    setProcessingId(employeeId);
    const location = await getLocation();
    const { error } = await supabase.from('time_clock').insert({
      employee_id: employeeId, clock_in: new Date().toISOString(),
      clock_in_lat: location.lat, clock_in_lng: location.lng, clock_in_address: location.address, dealer_id: dealerId
    });
    if (error) alert('Failed: ' + error.message);
    setProcessingId(null);
    fetchTimeEntries();
  }

  async function clockOut(entry) {
    setProcessingId(entry.id);
    const location = await getLocation();
    const clockOutTime = new Date(), clockInTime = new Date(entry.clock_in);
    let totalHours = (clockOutTime - clockInTime) / 3600000;
    if (entry.lunch_start && entry.lunch_end) totalHours -= (new Date(entry.lunch_end) - new Date(entry.lunch_start)) / 3600000;
    
    // PTO accrual for hourly employees
    const emp = employees.find(e => e.id === entry.employee_id);
    if (emp && (emp.pay_type || []).includes('hourly') && emp.pto_days_per_year > 0) {
      const ptoPerHour = (emp.pto_days_per_year * 8) / 2080;
      const ptoEarned = totalHours * ptoPerHour / 8;
      await supabase.from('employees').update({ pto_accrued: (emp.pto_accrued || 0) + ptoEarned }).eq('id', emp.id);
      if (refreshEmployees) refreshEmployees();
    }

    await supabase.from('time_clock').update({
      clock_out: clockOutTime.toISOString(), clock_out_lat: location.lat, clock_out_lng: location.lng,
      clock_out_address: location.address, total_hours: Math.round(totalHours * 100) / 100
    }).eq('id', entry.id);
    setProcessingId(null);
    fetchTimeEntries();
  }

  async function startLunch(entryId) {
    setProcessingId(entryId);
    await supabase.from('time_clock').update({ lunch_start: new Date().toISOString() }).eq('id', entryId);
    setProcessingId(null);
    fetchTimeEntries();
  }

  async function endLunch(entryId) {
    setProcessingId(entryId);
    await supabase.from('time_clock').update({ lunch_end: new Date().toISOString() }).eq('id', entryId);
    setProcessingId(null);
    fetchTimeEntries();
  }

  function calcBusinessDays(start, end) {
    if (!start || !end) return 0;
    const s = new Date(start), e = new Date(end);
    let days = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) days++;
    return days;
  }

  async function submitPTORequest() {
    if (!currentUserId || !ptoForm.start_date || !ptoForm.end_date) { alert('Select dates'); return; }
    setSubmittingPTO(true);
    const days = calcBusinessDays(ptoForm.start_date, ptoForm.end_date);
    const { error } = await supabase.from('time_off_requests').insert({
      employee_id: currentUserId, start_date: ptoForm.start_date, end_date: ptoForm.end_date,
      days_requested: days, request_type: ptoForm.request_type, reason: ptoForm.reason, dealer_id: dealerId
    });
    if (error) alert('Failed: ' + error.message);
    else { setShowPTOModal(false); setPtoForm({ start_date: '', end_date: '', request_type: 'pto', reason: '' }); fetchPTORequests(); }
    setSubmittingPTO(false);
  }

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-';
  const getElapsed = (clockIn) => {
    const ms = currentTime - new Date(clockIn);
    return { h: Math.floor(ms / 3600000), m: Math.floor((ms % 3600000) / 60000), s: Math.floor((ms % 60000) / 1000), total: ms / 3600000 };
  };
  const formatHours = (h) => { if (!h) return '0h'; const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60); return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`; };
  const getWeekTotal = (empId) => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    return timeEntries.filter(e => e.employee_id === empId && new Date(e.clock_in) >= weekStart && e.total_hours).reduce((sum, e) => sum + e.total_hours, 0);
  };
  const getRecentSessions = (empId) => timeEntries.filter(e => e.employee_id === empId).slice(0, 4);
  const getPTOBalance = (emp) => Math.max(0, (emp?.pto_accrued || 0) - (emp?.pto_used || 0));

  const activeEmployees = employees.filter(e => e.active);
  const isAdmin = !currentUserId;
  const currentEmployee = currentUserId ? employees.find(e => e.id === currentUserId) : null;
  const displayEmployees = isAdmin ? activeEmployees : activeEmployees.filter(e => e.id === currentUserId);
  const myRequests = ptoRequests.filter(r => r.employee_id === currentUserId);

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', fontWeight: '500' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: theme.text, margin: 0 }}>TIME CLOCK</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', marginTop: '4px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', backgroundColor: Object.keys(activeClocks).length > 0 ? 'rgba(34,197,94,0.2)' : theme.bgCard, borderRadius: '20px', marginRight: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: Object.keys(activeClocks).length > 0 ? '#22c55e' : theme.border }} />
              <span style={{ fontWeight: '600', color: Object.keys(activeClocks).length > 0 ? '#22c55e' : theme.textMuted }}>{Object.keys(activeClocks).length} Active</span>
            </span>
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={currentUserId || ''} onChange={(e) => setCurrentUserId(e.target.value ? parseInt(e.target.value) : null)} style={{ ...inputStyle, width: '180px', backgroundColor: theme.bgCard }}>
            <option value="">👑 Admin View</option>
            {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>👤 {emp.name}</option>)}
          </select>
          <div style={{ fontSize: '36px', fontWeight: '800', color: theme.text, fontFamily: 'monospace' }}>
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '16px', marginBottom: '24px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#ef4444' }}>{error}</div>}

      {/* Employee Summary */}
      {currentEmployee && (
        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `2px solid ${theme.accent}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', fontWeight: '700' }}>
                {currentEmployee.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>{currentEmployee.name}</h2>
                <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>{currentEmployee.roles?.[0] || 'Team Member'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.3)' }}>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#3b82f6' }}>{getPTOBalance(currentEmployee).toFixed(1)}</div>
                <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600' }}>PTO DAYS</div>
              </div>
              <button onClick={() => setShowPTOModal(true)} style={{ ...buttonStyle, padding: '14px 24px', background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', boxShadow: '0 4px 15px rgba(139,92,246,0.3)' }}>
                🏖️ Request Time Off
              </button>
            </div>
          </div>
          {myRequests.filter(r => r.status === 'pending').length > 0 && (
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: '8px', border: '1px solid rgba(234,179,8,0.3)' }}>
              <div style={{ color: '#eab308', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>⏳ Pending Requests</div>
              {myRequests.filter(r => r.status === 'pending').map(req => (
                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                  <span style={{ color: theme.text, fontSize: '13px' }}>{new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}</span>
                  <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{req.days_requested} days ({req.request_type.toUpperCase()})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '20px' }}>
        {displayEmployees.map(emp => {
          const entry = activeClocks[emp.id];
          const isActive = !!entry;
          const isProcessing = processingId === emp.id || processingId === entry?.id;
          const onLunch = entry?.lunch_start && !entry?.lunch_end;
          const elapsed = entry ? getElapsed(entry.clock_in) : null;
          const weekTotal = getWeekTotal(emp.id);
          const sessions = getRecentSessions(emp.id);
          const ptoBalance = getPTOBalance(emp);
          const statusColor = !isActive ? theme.border : elapsed.total >= 8 ? '#ef4444' : elapsed.total >= 4 && !entry.lunch_start ? '#eab308' : '#22c55e';

          return (
            <div key={emp.id} style={{ borderRadius: '20px', border: `3px solid ${statusColor}`, backgroundColor: theme.bgCard, overflow: 'hidden', boxShadow: isActive ? `0 0 40px ${statusColor}30` : 'none' }}>
              <div style={{ padding: '20px', background: isActive ? `linear-gradient(180deg, ${statusColor}25 0%, transparent 100%)` : 'transparent' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: `linear-gradient(135deg, ${statusColor} 0%, ${statusColor}80 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '24px', fontWeight: '800', boxShadow: isActive ? `0 0 30px ${statusColor}60` : 'none', border: '4px solid rgba(255,255,255,0.2)' }}>
                    {emp.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontWeight: '700', color: theme.text, fontSize: '20px', margin: 0 }}>{emp.name}</h3>
                    {isActive ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: onLunch ? '#eab308' : statusColor, animation: 'pulse 1.5s infinite' }} />
                        <span style={{ color: statusColor, fontSize: '14px', fontWeight: '700', textTransform: 'uppercase' }}>{onLunch ? 'On Lunch' : elapsed.total >= 8 ? 'Overtime!' : 'Working'}</span>
                      </div>
                    ) : <span style={{ color: theme.textMuted, fontSize: '14px' }}>Offline</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ padding: '8px 12px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: theme.textMuted, fontWeight: '600' }}>WEEK</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: theme.text }}>{formatHours(weekTotal)}</div>
                    </div>
                    <div style={{ padding: '8px 12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.3)', textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#3b82f6', fontWeight: '600' }}>PTO</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: '#3b82f6' }}>{ptoBalance.toFixed(1)}d</div>
                    </div>
                  </div>
                </div>
              </div>

              {isActive && (
                <div style={{ padding: '0 20px 20px' }}>
                  <div style={{ textAlign: 'center', padding: '24px', marginBottom: '16px', background: `linear-gradient(135deg, ${theme.bg} 0%, ${statusColor}15 100%)`, borderRadius: '16px', border: `2px solid ${statusColor}50` }}>
                    <div style={{ fontSize: '64px', fontWeight: '900', fontFamily: 'monospace', color: statusColor, letterSpacing: '4px', textShadow: `0 0 60px ${statusColor}60` }}>
                      {elapsed.h.toString().padStart(2, '0')}:{elapsed.m.toString().padStart(2, '0')}:{elapsed.s.toString().padStart(2, '0')}
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '12px' }}>
                      Started <strong style={{ color: theme.text }}>{formatTime(entry.clock_in)}</strong>
                      {entry.clock_in_address && entry.clock_in_address !== 'Denied' && <span> · 📍 {entry.clock_in_address}</span>}
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ height: '12px', backgroundColor: theme.bg, borderRadius: '6px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
                      <div style={{ height: '100%', width: `${Math.min((elapsed.total / 8) * 100, 100)}%`, background: elapsed.total >= 8 ? 'linear-gradient(90deg, #22c55e 0%, #eab308 50%, #ef4444 100%)' : elapsed.total >= 4 ? 'linear-gradient(90deg, #22c55e 0%, #eab308 100%)' : '#22c55e', borderRadius: '6px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted, marginTop: '6px', fontWeight: '600' }}>
                      <span>0h</span><span>4h</span><span>8h</span>
                    </div>
                  </div>

                  {elapsed.total >= 8 && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: '600' }}>⚠️ Over 8 hours!</div>}
                  {elapsed.total >= 4 && !entry.lunch_start && elapsed.total < 8 && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308', fontWeight: '600' }}>🍽️ Take a lunch break!</div>}
                  {entry.lunch_start && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: entry.lunch_end ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)', border: `1px solid ${entry.lunch_end ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`, color: entry.lunch_end ? '#22c55e' : '#eab308', fontWeight: '600' }}>🍽️ {formatTime(entry.lunch_start)} → {entry.lunch_end ? formatTime(entry.lunch_end) : 'In Progress...'}</div>}

                  <div style={{ display: 'flex', gap: '12px' }}>
                    {!entry.lunch_start ? <button onClick={() => startLunch(entry.id)} disabled={isProcessing} style={{ flex: 1, padding: '16px', backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308', border: '2px solid rgba(234,179,8,0.4)', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '15px', opacity: isProcessing ? 0.5 : 1 }}>🍽️ LUNCH</button>
                    : !entry.lunch_end ? <button onClick={() => endLunch(entry.id)} disabled={isProcessing} style={{ flex: 1, padding: '16px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '2px solid rgba(34,197,94,0.4)', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '15px', opacity: isProcessing ? 0.5 : 1 }}>✓ END LUNCH</button> : null}
                    <button onClick={() => clockOut(entry)} disabled={isProcessing || onLunch} style={{ flex: 1, padding: '16px', background: onLunch ? theme.border : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: onLunch ? 'not-allowed' : 'pointer', fontSize: '15px', opacity: isProcessing || onLunch ? 0.5 : 1, boxShadow: !onLunch ? '0 4px 20px rgba(239,68,68,0.4)' : 'none' }}>
                      {isProcessing ? '📍...' : '⏹️ OUT'}
                    </button>
                  </div>
                </div>
              )}

              {!isActive && (
                <div style={{ padding: '20px' }}>
                  <button onClick={() => clockIn(emp.id)} disabled={isProcessing} style={{ width: '100%', padding: '20px', background: isProcessing ? theme.border : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: isProcessing ? 'wait' : 'pointer', fontSize: '18px', opacity: isProcessing ? 0.7 : 1, boxShadow: isProcessing ? 'none' : '0 6px 30px rgba(34,197,94,0.5)' }}>
                    {isProcessing ? '📍 LOCATING...' : '▶️ CLOCK IN'}
                  </button>
                </div>
              )}

              {sessions.length > 0 && (
                <div style={{ padding: '16px 20px', backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Recent</div>
                  {sessions.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', marginBottom: '4px', borderRadius: '8px', backgroundColor: !s.clock_out ? `${statusColor}20` : theme.bgCard, border: `1px solid ${!s.clock_out ? statusColor + '40' : theme.border}` }}>
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>{new Date(s.clock_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(s.clock_in)} → {s.clock_out ? formatTime(s.clock_out) : 'now'}</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: !s.clock_out ? statusColor : theme.text }}>{s.clock_out ? formatHours(s.total_hours) : formatHours(elapsed?.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '48px', color: theme.textSecondary }}>Loading...</div>}

      {/* PTO Modal */}
      {showPTOModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>🏖️ Request Time Off</h2>
            {currentEmployee && <div style={{ padding: '12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: theme.textSecondary }}>Available PTO</span>
              <span style={{ color: '#3b82f6', fontWeight: '700', fontSize: '18px' }}>{getPTOBalance(currentEmployee).toFixed(1)} days</span>
            </div>}
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Start</label><input type="date" value={ptoForm.start_date} onChange={(e) => setPtoForm({ ...ptoForm, start_date: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>End</label><input type="date" value={ptoForm.end_date} onChange={(e) => setPtoForm({ ...ptoForm, end_date: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Type</label><select value={ptoForm.request_type} onChange={(e) => setPtoForm({ ...ptoForm, request_type: e.target.value })} style={inputStyle}>
                <option value="pto">🏖️ PTO</option><option value="sick">🤒 Sick</option><option value="personal">👤 Personal</option><option value="unpaid">💰 Unpaid</option>
              </select></div>
              <div><label style={labelStyle}>Reason</label><textarea value={ptoForm.reason} onChange={(e) => setPtoForm({ ...ptoForm, reason: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Optional" /></div>
              {ptoForm.start_date && ptoForm.end_date && <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ color: theme.text, fontSize: '18px', fontWeight: '700' }}>{calcBusinessDays(ptoForm.start_date, ptoForm.end_date)} business days</span>
              </div>}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowPTOModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={submitPTORequest} disabled={submittingPTO || !ptoForm.start_date || !ptoForm.end_date} style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', opacity: submittingPTO || !ptoForm.start_date || !ptoForm.end_date ? 0.6 : 1 }}>
                {submittingPTO ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }`}</style>
    </div>
  );
}