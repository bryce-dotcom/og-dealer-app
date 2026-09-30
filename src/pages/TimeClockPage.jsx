import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

const LONG_SHIFT_HOURS = 12;
const RECENT_DAYS = 14;

// Date-only strings ("2026-09-28") must be read as LOCAL dates, not UTC.
const parseYMD = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const pad2 = (n) => String(n).padStart(2, '0');
// Value for <input type="datetime-local"> in local time.
const toLocalInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function calcBusinessDays(start, end) {
  const s = parseYMD(start);
  const e = parseYMD(end);
  if (!s || !e || e < s) return 0;
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) days++;
  return days;
}

// Hours worked between clock-in and clock-out, minus a finished lunch that falls inside the shift.
function shiftHours(entry, clockOutTime) {
  const inT = new Date(entry.clock_in);
  let hours = (clockOutTime - inT) / 3600000;
  if (entry.lunch_start && entry.lunch_end) {
    const ls = new Date(entry.lunch_start);
    const le = new Date(entry.lunch_end);
    const overlapStart = Math.max(ls.getTime(), inT.getTime());
    const overlapEnd = Math.min(le.getTime(), clockOutTime.getTime());
    if (overlapEnd > overlapStart) hours -= (overlapEnd - overlapStart) / 3600000;
  }
  return Math.max(0, Math.round(hours * 100) / 100);
}

export default function TimeClockPage() {
  const { dealerId, employees, refreshEmployees, currentEmployee: storeEmployee } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  // Who is looking at this page: the dealership owner (can clock anyone in/out) or one employee.
  const [viewer, setViewer] = useState({ checked: false, isOwner: false, employeeId: storeEmployee?.id || null });
  const [ownerViewId, setOwnerViewId] = useState(null);

  const [timeEntries, setTimeEntries] = useState([]);
  const [activeClocks, setActiveClocks] = useState({});
  const [duplicateOpen, setDuplicateOpen] = useState({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [error, setError] = useState(null);
  const [showPTOModal, setShowPTOModal] = useState(false);
  const [ptoRequests, setPtoRequests] = useState([]);
  const [ptoForm, setPtoForm] = useState({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
  const [submittingPTO, setSubmittingPTO] = useState(false);
  const [longShiftEntry, setLongShiftEntry] = useState(null);
  const [longShiftOutTime, setLongShiftOutTime] = useState('');
  const [longShiftError, setLongShiftError] = useState('');

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Work out who is signed in. The store's currentEmployee is used when present; otherwise
  // we check the login against the dealership owner and the employees table.
  useEffect(() => {
    let cancelled = false;
    async function resolveViewer() {
      if (storeEmployee?.id) {
        if (!cancelled) setViewer({ checked: true, isOwner: false, employeeId: storeEmployee.id });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) { if (!cancelled) setViewer({ checked: true, isOwner: false, employeeId: null }); return; }
      const { data: dealerRow } = await supabase.from('dealer_settings').select('owner_user_id').eq('id', dealerId).maybeSingle();
      if (dealerRow?.owner_user_id === uid) {
        if (!cancelled) setViewer({ checked: true, isOwner: true, employeeId: null });
        return;
      }
      const { data: empRow } = await supabase.from('employees').select('id').eq('dealer_id', dealerId).eq('user_id', uid).maybeSingle();
      if (!cancelled) setViewer({ checked: true, isOwner: false, employeeId: empRow?.id || null });
    }
    if (dealerId) resolveViewer();
    return () => { cancelled = true; };
  }, [dealerId, storeEmployee?.id]);

  const myEmployeeId = viewer.isOwner ? null : viewer.employeeId;

  useEffect(() => {
    if (!dealerId || !viewer.checked) return;
    if (!viewer.isOwner && !viewer.employeeId) { setLoading(false); return; }
    fetchTimeEntries();
    fetchPTORequests();
  }, [dealerId, viewer.checked, viewer.isOwner, viewer.employeeId]);

  async function fetchTimeEntries() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - RECENT_DAYS);
    since.setHours(0, 0, 0, 0);

    let recentQuery = supabase.from('time_clock').select('*').eq('dealer_id', dealerId)
      .gte('clock_in', since.toISOString()).order('clock_in', { ascending: false }).limit(1000);
    // Open shifts are loaded separately so a forgotten clock-out from weeks ago is never missed.
    let openQuery = supabase.from('time_clock').select('*').eq('dealer_id', dealerId)
      .is('clock_out', null).order('clock_in', { ascending: false });
    if (myEmployeeId) {
      recentQuery = recentQuery.eq('employee_id', myEmployeeId);
      openQuery = openQuery.eq('employee_id', myEmployeeId);
    }
    const [recentRes, openRes] = await Promise.all([recentQuery, openQuery]);

    if (recentRes.error || openRes.error) {
      setError('Could not load the time clock: ' + (recentRes.error || openRes.error).message);
    } else {
      setError(null);
      setTimeEntries(recentRes.data || []);
      const active = {};
      const dupes = {};
      (openRes.data || []).forEach(entry => {
        if (!active[entry.employee_id]) active[entry.employee_id] = entry; // newest open shift
        else dupes[entry.employee_id] = (dupes[entry.employee_id] || 1) + 1;
      });
      setActiveClocks(active);
      setDuplicateOpen(dupes);
    }
    setLoading(false);
  }

  async function fetchPTORequests() {
    let query = supabase.from('time_off_requests').select('*, employees(name)').eq('dealer_id', dealerId).order('created_at', { ascending: false });
    if (myEmployeeId) query = query.eq('employee_id', myEmployeeId);
    const { data, error: ptoError } = await query;
    if (ptoError) setError('Could not load time-off requests: ' + ptoError.message);
    else setPtoRequests(data || []);
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
          } catch (e) { /* keep coordinates */ }
          resolve({ lat, lng, address });
        },
        () => resolve({ lat: null, lng: null, address: 'Denied' }),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function clockIn(employeeId) {
    setProcessingId(employeeId);
    try {
      // Never start a second shift while one is still open.
      const { data: open, error: openError } = await supabase.from('time_clock').select('id')
        .eq('dealer_id', dealerId).eq('employee_id', employeeId).is('clock_out', null).limit(1);
      if (openError) throw new Error('Could not check for an open shift: ' + openError.message);
      if (open && open.length > 0) {
        alert('Already clocked in. Clock out of the open shift first.');
        return;
      }
      const location = await getLocation();
      const { error: insertError } = await supabase.from('time_clock').insert({
        employee_id: employeeId, clock_in: new Date().toISOString(),
        clock_in_lat: location.lat, clock_in_lng: location.lng, clock_in_address: location.address, dealer_id: dealerId
      });
      if (insertError) throw new Error('Clock-in failed: ' + insertError.message);
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessingId(null);
      fetchTimeEntries();
    }
  }

  // PTO accrual for hourly employees. Runs only after the clock-out is saved.
  // Non-owners can't write the employees table, so a failure here is logged, never shown.
  async function accruePTO(employeeId, hours) {
    try {
      const emp = employees.find(e => e.id === employeeId);
      const payTypes = Array.isArray(emp?.pay_type) ? emp.pay_type : [emp?.pay_type || 'hourly'];
      if (!emp || !payTypes.includes('hourly') || !(Number(emp.pto_days_per_year) > 0) || !(hours > 0)) return;
      const ptoDaysEarned = hours * Number(emp.pto_days_per_year) / 2080; // days of PTO per hour worked
      const { data: fresh, error: readError } = await supabase.from('employees')
        .select('pto_accrued').eq('id', employeeId).eq('dealer_id', dealerId).maybeSingle();
      if (readError || !fresh) { console.warn('PTO accrual skipped (could not read balance):', readError?.message); return; }
      const { error: ptoError } = await supabase.from('employees')
        .update({ pto_accrued: (Number(fresh.pto_accrued) || 0) + ptoDaysEarned })
        .eq('id', employeeId).eq('dealer_id', dealerId);
      if (ptoError) { console.warn('PTO accrual not saved:', ptoError.message); return; }
      if (refreshEmployees) refreshEmployees();
    } catch (err) {
      console.warn('PTO accrual failed:', err);
    }
  }

  async function finishShift(entry, clockOutTime, location) {
    const totalHours = shiftHours(entry, clockOutTime);
    const { data: updated, error: updateError } = await supabase.from('time_clock').update({
      clock_out: clockOutTime.toISOString(), clock_out_lat: location.lat, clock_out_lng: location.lng,
      clock_out_address: location.address, total_hours: totalHours
    }).eq('id', entry.id).eq('dealer_id', dealerId).is('clock_out', null).select('id');
    if (updateError) throw new Error('Clock-out failed: ' + updateError.message);
    if (!updated || updated.length === 0) throw new Error('This shift was already clocked out (or could not be changed). The screen has been refreshed.');
    await accruePTO(entry.employee_id, totalHours);
  }

  async function clockOut(entry) {
    const hoursOpen = (Date.now() - new Date(entry.clock_in)) / 3600000;
    if (hoursOpen > LONG_SHIFT_HOURS) {
      // Probably a forgotten clock-out: let them enter when they actually left.
      setLongShiftEntry(entry);
      setLongShiftOutTime(toLocalInput(new Date()));
      setLongShiftError('');
      return;
    }
    setProcessingId(entry.id);
    try {
      const location = await getLocation();
      await finishShift(entry, new Date(), location);
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessingId(null);
      fetchTimeEntries();
    }
  }

  async function confirmLongShiftClockOut() {
    const entry = longShiftEntry;
    const outTime = new Date(longShiftOutTime);
    const inTime = new Date(entry.clock_in);
    if (isNaN(outTime.getTime())) { setLongShiftError('Enter a clock-out time.'); return; }
    if (outTime <= inTime) { setLongShiftError('Clock-out has to be after the clock-in time.'); return; }
    if (outTime.getTime() > Date.now() + 60000) { setLongShiftError("Clock-out can't be in the future."); return; }
    setProcessingId(entry.id);
    try {
      const enteredByHand = Date.now() - outTime.getTime() > 5 * 60000;
      const location = enteredByHand
        ? { lat: null, lng: null, address: 'Time entered by hand (forgot to clock out)' }
        : await getLocation();
      await finishShift(entry, outTime, location);
      setLongShiftEntry(null);
    } catch (err) {
      setLongShiftError(err.message);
    } finally {
      setProcessingId(null);
      fetchTimeEntries();
    }
  }

  async function setLunch(entryId, field) {
    setProcessingId(entryId);
    const { error: lunchError } = await supabase.from('time_clock').update({ [field]: new Date().toISOString() })
      .eq('id', entryId).eq('dealer_id', dealerId);
    if (lunchError) alert(`Could not ${field === 'lunch_start' ? 'start' : 'end'} lunch: ${lunchError.message}`);
    setProcessingId(null);
    fetchTimeEntries();
  }

  async function submitPTORequest() {
    if (!currentUserId || !ptoForm.start_date || !ptoForm.end_date) { alert('Select dates'); return; }
    if (ptoForm.end_date < ptoForm.start_date) { alert('The end date is before the start date.'); return; }
    setSubmittingPTO(true);
    const days = calcBusinessDays(ptoForm.start_date, ptoForm.end_date);
    const { error: insertError } = await supabase.from('time_off_requests').insert({
      employee_id: currentUserId, start_date: ptoForm.start_date, end_date: ptoForm.end_date,
      days_requested: days, request_type: ptoForm.request_type, reason: ptoForm.reason, dealer_id: dealerId
    });
    setSubmittingPTO(false);
    if (insertError) { alert('Could not send the request: ' + insertError.message); return; }
    setShowPTOModal(false);
    setPtoForm({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
    fetchPTORequests();
  }

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-';
  const formatDay = (d) => { const x = parseYMD(d); return x ? x.toLocaleDateString() : '-'; };
  const getElapsed = (clockIn) => {
    const ms = Math.max(0, currentTime - new Date(clockIn));
    return { h: Math.floor(ms / 3600000), m: Math.floor((ms % 3600000) / 60000), s: Math.floor((ms % 60000) / 1000), total: ms / 3600000 };
  };
  const formatHours = (h) => { if (!h) return '0h'; const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60); return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`; };
  const getWeekTotal = (empId) => {
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    return timeEntries.filter(e => e.employee_id === empId && new Date(e.clock_in) >= weekStart && e.total_hours).reduce((sum, e) => sum + (Number(e.total_hours) || 0), 0);
  };
  const getRecentSessions = (empId) => {
    const open = activeClocks[empId];
    const recent = timeEntries.filter(e => e.employee_id === empId && (!open || e.id !== open.id));
    return (open ? [open, ...recent] : recent).slice(0, 4);
  };
  const getPTOBalance = (emp) => Math.max(0, (Number(emp?.pto_accrued) || 0) - (Number(emp?.pto_used) || 0));

  const activeEmployees = employees.filter(e => e.active);
  const currentUserId = viewer.isOwner ? ownerViewId : viewer.employeeId;
  const isAdmin = viewer.isOwner && !ownerViewId;
  const currentEmployee = currentUserId ? employees.find(e => e.id === currentUserId) : null;
  const displayEmployees = isAdmin ? activeEmployees : activeEmployees.filter(e => e.id === currentUserId);
  const myRequests = ptoRequests.filter(r => r.employee_id === currentUserId);

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', fontWeight: '500' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };

  const notLinked = viewer.checked && !viewer.isOwner && !viewer.employeeId;

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: theme.text, margin: 0 }}>TIME CLOCK</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: '4px 0 8px' }}>Clock in when you start, clock out when you leave, and log your lunch break. Hours here feed payroll.</p>
          <p style={{ color: theme.textSecondary, fontSize: '14px', margin: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', backgroundColor: Object.keys(activeClocks).length > 0 ? 'rgba(34,197,94,0.2)' : theme.bgCard, borderRadius: '20px', marginRight: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: Object.keys(activeClocks).length > 0 ? '#22c55e' : theme.border }} />
              <span style={{ fontWeight: '600', color: Object.keys(activeClocks).length > 0 ? '#22c55e' : theme.textMuted }}>{Object.keys(activeClocks).length} Active</span>
            </span>
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {viewer.isOwner && (
            <select value={ownerViewId || ''} onChange={(e) => setOwnerViewId(e.target.value ? parseInt(e.target.value, 10) : null)} style={{ ...inputStyle, width: '180px', backgroundColor: theme.bgCard }}>
              <option value="">👑 Admin View</option>
              {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>👤 {emp.name}</option>)}
            </select>
          )}
          <div style={{ fontSize: '36px', fontWeight: '800', color: theme.text, fontFamily: 'monospace' }}>
            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '16px', marginBottom: '24px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', color: '#ef4444' }}>{error}</div>}

      {notLinked && (
        <div style={{ padding: '24px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, color: theme.textSecondary, textAlign: 'center' }}>
          We couldn't find an employee record for your login, so there's nothing to clock in to. Ask the owner to check your profile on the Team page.
        </div>
      )}

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
                  <span style={{ color: theme.text, fontSize: '13px' }}>{formatDay(req.start_date)} - {formatDay(req.end_date)}</span>
                  <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{req.days_requested} days ({(req.request_type || '').toUpperCase()})</span>
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
          const isLongShift = isActive && elapsed.total > LONG_SHIFT_HOURS;
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
                        <span style={{ color: statusColor, fontSize: '14px', fontWeight: '700', textTransform: 'uppercase' }}>{onLunch ? 'On Lunch' : isLongShift ? '12+ hours!' : elapsed.total >= 8 ? '8+ hours' : 'Working'}</span>
                      </div>
                    ) : <span style={{ color: theme.textMuted, fontSize: '14px' }}>Offline</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div title={weekTotal > 40 ? 'Over 40 hours this week (Sun–Sat): extra hours are paid as overtime' : 'Finished hours this week (Sun–Sat)'} style={{ padding: '8px 12px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${weekTotal > 40 ? 'rgba(239,68,68,0.5)' : theme.border}`, textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: weekTotal > 40 ? '#ef4444' : theme.textMuted, fontWeight: '600' }}>{weekTotal > 40 ? 'WEEK · OT' : 'WEEK'}</div>
                      <div style={{ fontSize: '16px', fontWeight: '800', color: weekTotal > 40 ? '#ef4444' : theme.text }}>{formatHours(weekTotal)}</div>
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
                      Started <strong style={{ color: theme.text }}>{isLongShift ? `${new Date(entry.clock_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ` : ''}{formatTime(entry.clock_in)}</strong>
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

                  {duplicateOpen[emp.id] && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: '600', fontSize: '13px' }}>⚠️ {emp.name} has {duplicateOpen[emp.id]} shifts with no clock-out. Clock out this one, then check the older one.</div>}
                  {isLongShift && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(239,68,68,0.2)', border: '2px solid rgba(239,68,68,0.5)', color: '#ef4444', fontWeight: '700' }}>⚠️ Clocked in for over {LONG_SHIFT_HOURS} hours. Did they forget to clock out? Clocking out will ask for the real time they left.</div>}
                  {!isLongShift && elapsed.total >= 8 && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontWeight: '600' }}>⚠️ Over 8 hours today</div>}
                  {elapsed.total >= 4 && !entry.lunch_start && elapsed.total < 8 && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', color: '#eab308', fontWeight: '600' }}>🍽️ Take a lunch break!</div>}
                  {entry.lunch_start && <div style={{ padding: '12px', borderRadius: '10px', marginBottom: '16px', background: entry.lunch_end ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)', border: `1px solid ${entry.lunch_end ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`, color: entry.lunch_end ? '#22c55e' : '#eab308', fontWeight: '600' }}>🍽️ {formatTime(entry.lunch_start)} → {entry.lunch_end ? formatTime(entry.lunch_end) : 'In Progress...'}</div>}

                  <div style={{ display: 'flex', gap: '12px' }}>
                    {!entry.lunch_start ? <button onClick={() => setLunch(entry.id, 'lunch_start')} disabled={isProcessing} style={{ flex: 1, padding: '16px', backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308', border: '2px solid rgba(234,179,8,0.4)', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '15px', opacity: isProcessing ? 0.5 : 1 }}>🍽️ LUNCH</button>
                    : !entry.lunch_end ? <button onClick={() => setLunch(entry.id, 'lunch_end')} disabled={isProcessing} style={{ flex: 1, padding: '16px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '2px solid rgba(34,197,94,0.4)', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '15px', opacity: isProcessing ? 0.5 : 1 }}>✓ END LUNCH</button> : null}
                    <button onClick={() => clockOut(entry)} disabled={isProcessing || onLunch} title={onLunch ? 'End lunch before clocking out' : ''} style={{ flex: 1, padding: '16px', background: onLunch ? theme.border : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '700', cursor: onLunch ? 'not-allowed' : 'pointer', fontSize: '15px', opacity: isProcessing || onLunch ? 0.5 : 1, boxShadow: !onLunch ? '0 4px 20px rgba(239,68,68,0.4)' : 'none' }}>
                      {isProcessing ? '📍...' : '⏹️ OUT'}
                    </button>
                  </div>
                </div>
              )}

              {!isActive && (
                <div style={{ padding: '20px' }}>
                  <button onClick={() => clockIn(emp.id)} disabled={isProcessing || loading} style={{ width: '100%', padding: '20px', background: isProcessing ? theme.border : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '800', cursor: isProcessing ? 'wait' : 'pointer', fontSize: '18px', opacity: isProcessing || loading ? 0.7 : 1, boxShadow: isProcessing ? 'none' : '0 6px 30px rgba(34,197,94,0.5)' }}>
                    {isProcessing ? '📍 LOCATING...' : '▶️ CLOCK IN'}
                  </button>
                </div>
              )}

              {sessions.length > 0 && (
                <div style={{ padding: '16px 20px', backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px', fontWeight: '700', textTransform: 'uppercase' }}>Recent</div>
                  {sessions.map(s => {
                    const hours = s.clock_out ? Number(s.total_hours) || 0 : getElapsed(s.clock_in).total;
                    const long = hours > LONG_SHIFT_HOURS;
                    const rowColor = long ? '#ef4444' : statusColor;
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: '4px', borderRadius: '8px', backgroundColor: long ? 'rgba(239,68,68,0.12)' : !s.clock_out ? `${statusColor}20` : theme.bgCard, border: `1px solid ${long ? 'rgba(239,68,68,0.5)' : !s.clock_out ? statusColor + '40' : theme.border}` }}>
                        <span style={{ fontSize: '12px', color: theme.textMuted }}>{new Date(s.clock_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(s.clock_in)} → {s.clock_out ? formatTime(s.clock_out) : 'now'}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: long ? '#ef4444' : !s.clock_out ? rowColor : theme.text }}>
                          {long && <span title={`Over ${LONG_SHIFT_HOURS} hours — check for a missed clock-out`} style={{ fontSize: '10px', padding: '2px 6px', marginRight: '6px', borderRadius: '4px', backgroundColor: 'rgba(239,68,68,0.2)' }}>12h+ CHECK</span>}
                          {formatHours(hours)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && viewer.checked && !notLinked && displayEmployees.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}>No active employees to show.</div>
      )}
      {(loading || !viewer.checked) && <div style={{ textAlign: 'center', padding: '48px', color: theme.textSecondary }}>Loading...</div>}

      {/* Long-shift clock-out */}
      {longShiftEntry && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>⚠️ Long shift</h2>
            <p style={{ color: theme.textSecondary, fontSize: '14px', marginBottom: '16px' }}>
              {employees.find(e => e.id === longShiftEntry.employee_id)?.name || 'This person'} has been clocked in since{' '}
              <strong style={{ color: theme.text }}>{new Date(longShiftEntry.clock_in).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
              {' '}({formatHours(getElapsed(longShiftEntry.clock_in).total)}). If they forgot to clock out, enter the time they actually left. These hours go straight into payroll.
            </p>
            <label style={labelStyle}>Clock-out time</label>
            <input type="datetime-local" value={longShiftOutTime} min={toLocalInput(new Date(longShiftEntry.clock_in))} max={toLocalInput(new Date())} onChange={(e) => setLongShiftOutTime(e.target.value)} style={inputStyle} />
            {longShiftOutTime && !isNaN(new Date(longShiftOutTime).getTime()) && new Date(longShiftOutTime) > new Date(longShiftEntry.clock_in) && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: theme.textSecondary }}>Hours to record: <strong style={{ color: theme.text }}>{formatHours(shiftHours(longShiftEntry, new Date(longShiftOutTime)))}</strong></div>
            )}
            {longShiftError && <div style={{ marginTop: '12px', padding: '10px 12px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>{longShiftError}</div>}
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => setLongShiftEntry(null)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={confirmLongShiftClockOut} disabled={processingId === longShiftEntry.id} style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', opacity: processingId === longShiftEntry.id ? 0.6 : 1 }}>
                {processingId === longShiftEntry.id ? 'Saving...' : 'Clock Out'}
              </button>
            </div>
          </div>
        </div>
      )}

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
