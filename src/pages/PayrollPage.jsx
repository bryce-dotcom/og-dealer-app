import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function PayrollPage() {
  const { dealerId, dealer, employees, refreshEmployees, refreshDealer } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  const [timeEntries, setTimeEntries] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [ptoRequests, setPtoRequests] = useState([]);
  const [showPTOModal, setShowPTOModal] = useState(false);
  const [ptoForm, setPtoForm] = useState({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
  const [submittingPTO, setSubmittingPTO] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState(null);
  const [runningPayroll, setRunningPayroll] = useState(false);
  const [showRunPayrollModal, setShowRunPayrollModal] = useState(false);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [paystubs, setPaystubs] = useState([]);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [selectedEmployeeForComm, setSelectedEmployeeForComm] = useState(null);
  const [payAdjustments, setPayAdjustments] = useState({});
  const [paySettings, setPaySettings] = useState({
    pay_frequency: dealer?.pay_frequency || 'bi-weekly',
    pay_day_1: dealer?.pay_day_1 || '20',
    pay_day_2: dealer?.pay_day_2 || '5'
  });

  const isAdmin = !currentUserId;
  const currentEmployee = currentUserId ? employees.find(e => e.id === currentUserId) : null;

  useEffect(() => {
    if (dealerId) { fetchTimeEntries(); fetchCommissions(); fetchPTORequests(); fetchPayrollRuns(); }
  }, [dealerId]);

  useEffect(() => {
    setPaySettings({
      pay_frequency: dealer?.pay_frequency || 'bi-weekly',
      pay_day_1: dealer?.pay_day_1 || '20',
      pay_day_2: dealer?.pay_day_2 || '5'
    });
  }, [dealer]);

  useEffect(() => {
    if (currentUserId) fetchPaystubs(currentUserId);
    else fetchPaystubs();
  }, [currentUserId, dealerId]);

  async function fetchTimeEntries() {
    setLoading(true);
    const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const { data } = await supabase.from('time_clock').select('*, employees(name, hourly_rate, salary, pay_type)')
      .eq('dealer_id', dealerId).gte('clock_in', sixtyDaysAgo.toISOString()).order('clock_in', { ascending: false });
    if (data) setTimeEntries(data);
    setLoading(false);
  }

  async function fetchCommissions() {
    const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const { data } = await supabase.from('inventory_commissions').select('*')
      .eq('dealer_id', dealerId).gte('created_at', sixtyDaysAgo.toISOString()).order('created_at', { ascending: false });
    if (data) setCommissions(data);
  }

  async function fetchPTORequests() {
    const { data } = await supabase.from('time_off_requests').select('*, employees(name)')
      .eq('dealer_id', dealerId).order('created_at', { ascending: false });
    if (data) setPtoRequests(data);
  }

  async function fetchPayrollRuns() {
    const { data } = await supabase.from('payroll_runs').select('*')
      .eq('dealer_id', dealerId).order('pay_date', { ascending: false }).limit(10);
    if (data) setPayrollRuns(data);
  }

  async function fetchPaystubs(employeeId = null) {
    let query = supabase.from('paystubs').select('*').eq('dealer_id', dealerId).order('pay_date', { ascending: false });
    if (employeeId) query = query.eq('employee_id', employeeId);
    const { data } = await query.limit(50);
    if (data) setPaystubs(data);
  }

  async function savePaySettings() {
    setSavingSettings(true);
    await supabase.from('dealer_settings').update({
      pay_frequency: paySettings.pay_frequency,
      pay_day_1: paySettings.pay_day_1,
      pay_day_2: paySettings.pay_day_2
    }).eq('id', dealerId);
    if (refreshDealer) await refreshDealer();
    setSavingSettings(false);
    setShowSettings(false);
  }

  function getOrdinal(n) {
    const num = parseInt(n);
    const s = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    return num + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function getPayPeriodDates() {
    const now = new Date();
    let start, end;
    const freq = paySettings.pay_frequency;
    
    if (freq === 'weekly') {
      end = new Date(now);
      end.setDate(now.getDate() - now.getDay() - 1);
      start = new Date(end);
      start.setDate(end.getDate() - 6);
    } else if (freq === 'bi-weekly') {
      end = new Date(now);
      end.setDate(now.getDate() - now.getDay() - 1);
      start = new Date(end);
      start.setDate(end.getDate() - 13);
    } else if (freq === 'semi-monthly') {
      const day1 = parseInt(paySettings.pay_day_2) || 5;
      const day2 = parseInt(paySettings.pay_day_1) || 20;
      
      if (now.getDate() < day1) {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 16);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
      } else if (now.getDate() < day2) {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth(), 15);
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), 16);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    }
    
    return { start, end };
  }

  function getNextPayDate() {
    const now = new Date();
    const freq = paySettings.pay_frequency;
    
    if (freq === 'weekly' || freq === 'bi-weekly') {
      const result = new Date(now);
      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
      result.setDate(now.getDate() + daysUntilFriday);
      return result;
    } else if (freq === 'semi-monthly') {
      const day1 = parseInt(paySettings.pay_day_2) || 5;
      const day2 = parseInt(paySettings.pay_day_1) || 20;
      
      if (now.getDate() < day1) return new Date(now.getFullYear(), now.getMonth(), day1);
      if (now.getDate() < day2) return new Date(now.getFullYear(), now.getMonth(), day2);
      return new Date(now.getFullYear(), now.getMonth() + 1, day1);
    } else {
      const payDay = parseInt(paySettings.pay_day_1) || 20;
      if (now.getDate() < payDay) return new Date(now.getFullYear(), now.getMonth(), payDay);
      return new Date(now.getFullYear(), now.getMonth() + 1, payDay);
    }
  }

  function getPayScheduleDescription() {
    const freq = paySettings.pay_frequency;
    if (freq === 'weekly') return 'Every Friday';
    if (freq === 'bi-weekly') return 'Every other Friday';
    if (freq === 'semi-monthly') return `${getOrdinal(paySettings.pay_day_2 || 5)} & ${getOrdinal(paySettings.pay_day_1 || 20)} of each month`;
    return `${getOrdinal(paySettings.pay_day_1 || 20)} of each month`;
  }

  function calculatePayroll(empId, periodStart, periodEnd) {
    const empEntries = timeEntries.filter(e => {
      const d = new Date(e.clock_in);
      return e.employee_id === empId && d >= periodStart && d <= periodEnd && e.total_hours;
    });
    const emp = employees.find(e => e.id === empId);
    const totalHours = empEntries.reduce((sum, e) => sum + (e.total_hours || 0), 0);
    const regularHours = Math.min(totalHours, 40 * (paySettings.pay_frequency === 'weekly' ? 1 : 2));
    const overtimeHours = Math.max(0, totalHours - regularHours);
    const payTypes = Array.isArray(emp?.pay_type) ? emp.pay_type : [emp?.pay_type || 'hourly'];
    const hourlyRate = emp?.hourly_rate || 0;
    const salary = emp?.salary || 0;
    let basePay = 0;

    if (payTypes.includes('hourly')) basePay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
    if (payTypes.includes('salary')) {
      const periods = paySettings.pay_frequency === 'weekly' ? 52 : paySettings.pay_frequency === 'bi-weekly' ? 26 : paySettings.pay_frequency === 'semi-monthly' ? 24 : 12;
      basePay += salary / periods;
    }

    // Calculate commissions earned during this pay period
    const periodCommissions = commissions.filter(c => {
      const d = new Date(c.created_at);
      return c.employee_id === empId && d >= periodStart && d <= periodEnd;
    });
    const commissionAmount = periodCommissions.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);

    const grossPay = basePay + commissionAmount;

    return { totalHours, regularHours, overtimeHours, basePay, commissionAmount, grossPay, hourlyRate, salary };
  }

  async function runPayroll() {
    setRunningPayroll(true);
    const { start, end } = getPayPeriodDates();
    const payDate = getNextPayDate();
    const activeEmps = employees.filter(e => e.active);
    
    const { data: runData, error: runError } = await supabase.from('payroll_runs').insert({
      pay_period_start: start.toISOString().split('T')[0],
      pay_period_end: end.toISOString().split('T')[0],
      pay_date: payDate.toISOString().split('T')[0],
      employee_count: activeEmps.length,
      total_gross: 0, total_net: 0, status: 'finalized', dealer_id: dealerId
    }).select().single();
    
    if (runError) { alert('Failed: ' + runError.message); setRunningPayroll(false); return; }
    
    let totalGross = 0, totalNet = 0;
    
    for (const emp of activeEmps) {
      const payData = calculatePayroll(emp.id, start, end);
      const adjustments = payAdjustments[emp.id] || { bonus: 0, reimbursement: 0, hoursOverride: null };
      const bonusAmount = parseFloat(adjustments.bonus) || 0;
      const reimbursementAmount = parseFloat(adjustments.reimbursement) || 0;

      // Recalculate hours if overridden
      let finalHours = payData.totalHours;
      let finalRegularHours = payData.regularHours;
      let finalOvertimeHours = payData.overtimeHours;
      let finalBasePay = payData.basePay;

      if (adjustments.hoursOverride !== null && adjustments.hoursOverride !== '') {
        finalHours = parseFloat(adjustments.hoursOverride);
        finalRegularHours = Math.min(finalHours, 40 * (paySettings.pay_frequency === 'weekly' ? 1 : 2));
        finalOvertimeHours = Math.max(0, finalHours - finalRegularHours);
        const payTypes = Array.isArray(emp.pay_type) ? emp.pay_type : [emp.pay_type || 'hourly'];
        finalBasePay = 0;
        if (payTypes.includes('hourly')) finalBasePay = (finalRegularHours * (emp.hourly_rate || 0)) + (finalOvertimeHours * (emp.hourly_rate || 0) * 1.5);
        if (payTypes.includes('salary')) {
          const periods = paySettings.pay_frequency === 'weekly' ? 52 : paySettings.pay_frequency === 'bi-weekly' ? 26 : paySettings.pay_frequency === 'semi-monthly' ? 24 : 12;
          finalBasePay += (emp.salary || 0) / periods;
        }
      }

      const totalGrossPay = finalBasePay + payData.commissionAmount + bonusAmount;
      if (totalGrossPay <= 0) continue;

      const federalTax = totalGrossPay * 0.12;
      const stateTax = totalGrossPay * 0.0495;
      const socialSecurity = totalGrossPay * 0.062;
      const medicare = totalGrossPay * 0.0145;
      const netPay = totalGrossPay + reimbursementAmount - federalTax - stateTax - socialSecurity - medicare;
      
      await supabase.from('paystubs').insert({
        employee_id: emp.id,
        pay_period_start: start.toISOString().split('T')[0],
        pay_period_end: end.toISOString().split('T')[0],
        pay_date: payDate.toISOString().split('T')[0],
        regular_hours: finalRegularHours, overtime_hours: finalOvertimeHours,
        hourly_rate: emp.hourly_rate || 0, salary_amount: emp.salary || 0,
        commission_amount: payData.commissionAmount,
        bonus_amount: bonusAmount,
        reimbursement_amount: reimbursementAmount,
        gross_pay: totalGrossPay, federal_tax: federalTax, state_tax: stateTax,
        social_security: socialSecurity, medicare: medicare, net_pay: netPay,
        status: 'generated', dealer_id: dealerId
      });

      totalGross += totalGrossPay;
      totalNet += netPay;
    }
    
    await supabase.from('payroll_runs').update({ total_gross: totalGross, total_net: totalNet }).eq('id', runData.id);
    await fetchPayrollRuns();
    await fetchPaystubs();
    setRunningPayroll(false);
    setShowRunPayrollModal(false);
    alert(`Payroll complete! ${activeEmps.length} paystubs generated.`);
  }

  function exportToCSV() {
    const { start, end } = getPayPeriodDates();
    const payDate = getNextPayDate();
    const activeEmps = employees.filter(e => e.active);

    const headers = ['Employee Name','Email','Pay Type','Regular Hours','OT Hours','Hourly Rate','Annual Salary','Commission','Gross Pay','Period Start','Period End','Pay Date'];
    const rows = activeEmps.map(emp => {
      const payData = calculatePayroll(emp.id, start, end);
      const payTypes = Array.isArray(emp.pay_type) ? emp.pay_type.join('+') : emp.pay_type || 'hourly';
      return [emp.name, emp.email || '', payTypes, payData.regularHours.toFixed(2), payData.overtimeHours.toFixed(2),
        emp.hourly_rate || 0, emp.salary || 0, payData.commissionAmount.toFixed(2), payData.grossPay.toFixed(2),
        start.toISOString().split('T')[0], end.toISOString().split('T')[0], payDate.toISOString().split('T')[0]
      ].map(v => `"${v}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function calcBusinessDays(s, e) {
    if (!s || !e) return 0;
    let days = 0;
    for (let d = new Date(s); d <= new Date(e); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) days++;
    return days;
  }

  async function submitPTORequest() {
    if (!currentUserId || !ptoForm.start_date || !ptoForm.end_date) return;
    setSubmittingPTO(true);
    const days = calcBusinessDays(ptoForm.start_date, ptoForm.end_date);
    await supabase.from('time_off_requests').insert({
      employee_id: currentUserId, start_date: ptoForm.start_date, end_date: ptoForm.end_date,
      days_requested: days, request_type: ptoForm.request_type, reason: ptoForm.reason, dealer_id: dealerId
    });
    setShowPTOModal(false);
    setPtoForm({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
    fetchPTORequests();
    setSubmittingPTO(false);
  }

  async function handlePTOAction(request, action) {
    setProcessingRequestId(request.id);
    if (action === 'approved' && request.request_type === 'pto') {
      const emp = employees.find(e => e.id === request.employee_id);
      if (emp) await supabase.from('employees').update({ pto_used: (emp.pto_used || 0) + request.days_requested }).eq('id', emp.id);
      if (refreshEmployees) await refreshEmployees();
    }
    await supabase.from('time_off_requests').update({ status: action, approved_at: new Date().toISOString() }).eq('id', request.id);
    fetchPTORequests();
    setProcessingRequestId(null);
  }

  async function deleteCommission(commissionId) {
    if (!confirm('Delete this commission?')) return;
    await supabase.from('inventory_commissions').delete().eq('id', commissionId);
    await fetchCommissions();
    if (selectedEmployeeForComm) {
      // Refresh the modal view
      setSelectedEmployeeForComm(employees.find(e => e.id === selectedEmployeeForComm.id));
    }
  }

  function openCommissionModal(emp) {
    setSelectedEmployeeForComm(emp);
    setShowCommissionModal(true);
  }

  const getPTOBalance = (emp) => Math.max(0, (emp?.pto_accrued || 0) - (emp?.pto_used || 0));
  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amt || 0);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
  const formatDateFull = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  const { start: periodStart, end: periodEnd } = getPayPeriodDates();
  const nextPayDate = getNextPayDate();
  const daysUntilPay = Math.max(0, Math.ceil((nextPayDate - new Date()) / 86400000));
  const activeEmployees = employees.filter(e => e.active);
  const displayEmployees = isAdmin ? activeEmployees : (currentEmployee ? [currentEmployee] : []);
  const totalPayroll = activeEmployees.reduce((sum, emp) => sum + calculatePayroll(emp.id, periodStart, periodEnd).grossPay, 0);
  const pendingRequests = ptoRequests.filter(r => r.status === 'pending');
  const myRequests = ptoRequests.filter(r => r.employee_id === currentUserId);
  const myPaystubs = paystubs.filter(p => p.employee_id === currentUserId);

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', fontWeight: '500' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Payroll</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', marginTop: '4px' }}>{getPayScheduleDescription()} · {formatDate(periodStart)} - {formatDate(periodEnd)}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={currentUserId || ''} onChange={(e) => setCurrentUserId(e.target.value ? parseInt(e.target.value) : null)} style={{ ...inputStyle, width: '180px', backgroundColor: theme.bgCard }}>
            <option value="">👑 Admin View</option>
            {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>👤 {emp.name}</option>)}
          </select>
          {isAdmin && (
            <>
              <button onClick={() => setShowSettings(true)} style={{ ...buttonStyle, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, color: theme.text }}>⚙️</button>
              <button onClick={exportToCSV} style={{ ...buttonStyle, backgroundColor: '#3b82f6' }}>📊 Export</button>
              <button onClick={() => setShowRunPayrollModal(true)} style={{ ...buttonStyle, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>▶️ Run Payroll</button>
            </>
          )}
        </div>
      </div>

      {/* Admin Summary */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Next Pay Date</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatDate(nextPayDate)}</div>
            <div style={{ fontSize: '13px', color: theme.accent, marginTop: '4px' }}>{daysUntilPay} days</div>
          </div>
          <div style={{ padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Est. Gross</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(totalPayroll)}</div>
          </div>
          <div style={{ padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Employees</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{activeEmployees.length}</div>
          </div>
          <div style={{ padding: '20px', backgroundColor: pendingRequests.length > 0 ? 'rgba(234,179,8,0.15)' : theme.bgCard, borderRadius: '12px', border: `1px solid ${pendingRequests.length > 0 ? 'rgba(234,179,8,0.3)' : theme.border}` }}>
            <div style={{ fontSize: '12px', color: pendingRequests.length > 0 ? '#eab308' : theme.textMuted, marginBottom: '8px' }}>PTO Requests</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: pendingRequests.length > 0 ? '#eab308' : theme.text }}>{pendingRequests.length}</div>
          </div>
        </div>
      )}

      {/* Recent Runs */}
      {isAdmin && payrollRuns.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <h3 style={{ color: theme.text, fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>📋 Recent Payroll Runs</h3>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {payrollRuns.slice(0, 5).map(run => (
              <div key={run.id} style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, minWidth: '180px' }}>
                <div style={{ fontSize: '13px', color: theme.text, fontWeight: '600' }}>Pay: {formatDate(run.pay_date)}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>{formatDate(run.pay_period_start)} - {formatDate(run.pay_period_end)}</div>
                <div style={{ fontSize: '16px', color: '#22c55e', fontWeight: '700', marginTop: '8px' }}>{formatCurrency(run.total_gross)}</div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{run.employee_count} employees</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee Card */}
      {currentEmployee && (
        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: theme.bgCard, borderRadius: '16px', border: `2px solid ${theme.accent}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px', fontWeight: '700' }}>
                {currentEmployee.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', margin: 0 }}>{currentEmployee.name}</h2>
                <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>{currentEmployee.roles?.[0] || 'Team Member'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.3)' }}>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#3b82f6' }}>{getPTOBalance(currentEmployee).toFixed(1)}</div>
                <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600' }}>PTO DAYS</div>
              </div>
              <button onClick={() => setShowPTOModal(true)} style={{ ...buttonStyle, padding: '14px 24px', background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>🏖️ Request Time Off</button>
            </div>
          </div>
          
          {/* My Paystubs */}
          {myPaystubs.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ color: theme.text, fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>📄 My Paystubs</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {myPaystubs.slice(0, 5).map(stub => (
                  <div key={stub.id} style={{ padding: '12px 16px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: theme.text, fontWeight: '500' }}>Pay Date: {formatDateFull(stub.pay_date)}</div>
                      <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>
                        {formatDate(stub.pay_period_start)} - {formatDate(stub.pay_period_end)} · {(stub.regular_hours || 0).toFixed(1)}hrs
                        {stub.overtime_hours > 0 && <span style={{ color: '#ef4444' }}> +{stub.overtime_hours.toFixed(1)} OT</span>}
                        {stub.commission_amount > 0 && <span style={{ color: '#8b5cf6' }}> · {formatCurrency(stub.commission_amount)} comm</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(stub.net_pay)}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Net Pay</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myRequests.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px', fontWeight: '600' }}>My Requests</div>
              {myRequests.slice(0, 3).map(req => (
                <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', marginBottom: '8px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                  <span style={{ color: theme.text, fontSize: '13px' }}>{formatDate(req.start_date)} - {formatDate(req.end_date)} · {req.days_requested}d ({req.request_type})</span>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: req.status === 'approved' ? 'rgba(34,197,94,0.2)' : req.status === 'denied' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)', color: req.status === 'approved' ? '#22c55e' : req.status === 'denied' ? '#ef4444' : '#eab308' }}>{req.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PTO Approvals */}
      {isAdmin && pendingRequests.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: 'rgba(234,179,8,0.1)', borderRadius: '16px', border: '1px solid rgba(234,179,8,0.3)' }}>
          <h3 style={{ color: '#eab308', fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>⏳ Pending Time Off ({pendingRequests.length})</h3>
          {pendingRequests.map(req => {
            const emp = employees.find(e => e.id === req.employee_id);
            const ptoBalance = getPTOBalance(emp);
            const hasEnough = req.request_type !== 'pto' || ptoBalance >= req.days_requested;
            return (
              <div key={req.id} style={{ padding: '16px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: '700' }}>{emp?.name?.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
                  <div>
                    <div style={{ color: theme.text, fontWeight: '600' }}>{emp?.name}</div>
                    <div style={{ color: theme.textSecondary, fontSize: '13px' }}>{formatDate(req.start_date)} - {formatDate(req.end_date)} · <strong>{req.days_requested}d</strong> · {req.request_type.toUpperCase()}</div>
                    {req.reason && <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>"{req.reason}"</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {req.request_type === 'pto' && <div style={{ padding: '8px 12px', backgroundColor: hasEnough ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '14px', fontWeight: '700', color: hasEnough ? '#3b82f6' : '#ef4444' }}>{ptoBalance.toFixed(1)}</div><div style={{ fontSize: '10px', color: theme.textMuted }}>BAL</div></div>}
                  <button onClick={() => handlePTOAction(req, 'denied')} disabled={processingRequestId === req.id} style={{ padding: '10px 16px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: processingRequestId === req.id ? 0.5 : 1 }}>✕ Deny</button>
                  <button onClick={() => handlePTOAction(req, 'approved')} disabled={processingRequestId === req.id || !hasEnough} style={{ padding: '10px 16px', backgroundColor: hasEnough ? 'rgba(34,197,94,0.15)' : theme.border, color: hasEnough ? '#22c55e' : theme.textMuted, border: `1px solid ${hasEnough ? 'rgba(34,197,94,0.3)' : theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: hasEnough ? 'pointer' : 'not-allowed', opacity: processingRequestId === req.id ? 0.5 : 1 }}>✓ Approve</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payroll List */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{isAdmin ? 'Current Period' : 'My Pay'}</h2>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>{formatDate(periodStart)} - {formatDate(periodEnd)}</span>
        </div>
        {loading ? <div style={{ padding: '48px', textAlign: 'center', color: theme.textSecondary }}>Loading...</div> : (
          <div>
            {displayEmployees.map(emp => {
              const payData = calculatePayroll(emp.id, periodStart, periodEnd);
              const payTypes = Array.isArray(emp.pay_type) ? emp.pay_type : [emp.pay_type || 'hourly'];
              return (
                <div key={emp.id} onClick={() => isAdmin && openCommissionModal(emp)} style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', cursor: isAdmin ? 'pointer' : 'default', transition: 'background-color 0.2s' }} onMouseEnter={(e) => isAdmin && (e.currentTarget.style.backgroundColor = theme.bg)} onMouseLeave={(e) => isAdmin && (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: '700', flexShrink: 0 }}>{emp.name?.split(' ').map(n => n[0]).join('').slice(0,2)}</div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{emp.name}</div>
                    <div style={{ color: theme.textMuted, fontSize: '13px' }}>{payTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' + ')}{payTypes.includes('hourly') && ` · ${formatCurrency(emp.hourly_rate)}/hr`}{payTypes.includes('salary') && ` · ${formatCurrency(emp.salary)}/yr`}</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: '80px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{payData.totalHours.toFixed(1)}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>HOURS</div>
                    {payData.overtimeHours > 0 && <div style={{ fontSize: '11px', color: '#ef4444' }}>+{payData.overtimeHours.toFixed(1)} OT</div>}
                  </div>
                  {payData.commissionAmount > 0 && (
                    <div style={{ textAlign: 'center', minWidth: '80px', padding: '8px 12px', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: '#8b5cf6' }}>{formatCurrency(payData.commissionAmount)}</div>
                      <div style={{ fontSize: '10px', color: '#8b5cf6' }}>COMM</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center', minWidth: '70px', padding: '8px 12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6' }}>{getPTOBalance(emp).toFixed(1)}</div>
                    <div style={{ fontSize: '10px', color: '#3b82f6' }}>PTO</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '100px' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(payData.grossPay)}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>GROSS</div>
                  </div>
                </div>
              );
            })}
            {isAdmin && <div style={{ padding: '16px 20px', backgroundColor: theme.bg, display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary }}>TOTAL</span><span style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(totalPayroll)}</span></div>}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>⚙️ Pay Schedule</h2>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div><label style={labelStyle}>Pay Frequency</label><select value={paySettings.pay_frequency} onChange={(e) => setPaySettings({ ...paySettings, pay_frequency: e.target.value })} style={inputStyle}>
                <option value="weekly">Weekly (Fridays)</option><option value="bi-weekly">Bi-Weekly (Fridays)</option><option value="semi-monthly">Semi-Monthly</option><option value="monthly">Monthly</option>
              </select></div>
              {paySettings.pay_frequency === 'semi-monthly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={labelStyle}>1st Pay Day</label><select value={paySettings.pay_day_2} onChange={(e) => setPaySettings({ ...paySettings, pay_day_2: e.target.value })} style={inputStyle}>{[1,2,3,4,5,6,7,8,9,10].map(d => <option key={d} value={d}>{getOrdinal(d)}</option>)}</select><div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>For 16th-end</div></div>
                  <div><label style={labelStyle}>2nd Pay Day</label><select value={paySettings.pay_day_1} onChange={(e) => setPaySettings({ ...paySettings, pay_day_1: e.target.value })} style={inputStyle}>{[15,16,17,18,19,20,21,22,23,24,25].map(d => <option key={d} value={d}>{getOrdinal(d)}</option>)}</select><div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>For 1st-15th</div></div>
                </div>
              )}
              {paySettings.pay_frequency === 'monthly' && (
                <div><label style={labelStyle}>Pay Day</label><select value={paySettings.pay_day_1} onChange={(e) => setPaySettings({ ...paySettings, pay_day_1: e.target.value })} style={inputStyle}>{[1,5,10,15,20,25,28].map(d => <option key={d} value={d}>{getOrdinal(d)}</option>)}</select></div>
              )}
              <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}><span style={{ color: theme.textSecondary, fontSize: '13px' }}>Schedule: </span><span style={{ color: theme.text, fontWeight: '600' }}>{getPayScheduleDescription()}</span></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowSettings(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={savePaySettings} disabled={savingSettings} style={{ ...buttonStyle, flex: 1, opacity: savingSettings ? 0.6 : 1 }}>{savingSettings ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Run Payroll Modal */}
      {showRunPayrollModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '500px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>▶️ Run Payroll</h2>
            <p style={{ color: theme.textSecondary, fontSize: '14px', marginBottom: '20px' }}>Generate paystubs for all employees</p>
            <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '12px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>PERIOD</div><div style={{ fontSize: '16px', color: theme.text, fontWeight: '600' }}>{formatDate(periodStart)} - {formatDate(periodEnd)}</div></div>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>PAY DATE</div><div style={{ fontSize: '16px', color: theme.text, fontWeight: '600' }}>{formatDateFull(nextPayDate)}</div></div>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>EMPLOYEES</div><div style={{ fontSize: '16px', color: theme.text, fontWeight: '600' }}>{activeEmployees.length}</div></div>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>EST. GROSS</div><div style={{ fontSize: '16px', color: '#22c55e', fontWeight: '600' }}>{formatCurrency(totalPayroll)}</div></div>
            </div>
            <div style={{ padding: '12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(59,130,246,0.3)', fontSize: '13px', color: '#3b82f6' }}>Paystubs will appear in each employee's profile. Export CSV for Gusto.</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowRunPayrollModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={runPayroll} disabled={runningPayroll} style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', opacity: runningPayroll ? 0.6 : 1 }}>{runningPayroll ? 'Processing...' : '✓ Run Payroll'}</button>
            </div>
          </div>
        </div>
      )}

      {/* PTO Modal */}
      {showPTOModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>🏖️ Request Time Off</h2>
            {currentEmployee && <div style={{ padding: '12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Available PTO</span><span style={{ color: '#3b82f6', fontWeight: '700', fontSize: '18px' }}>{getPTOBalance(currentEmployee).toFixed(1)} days</span></div>}
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div><label style={labelStyle}>Start</label><input type="date" value={ptoForm.start_date} onChange={(e) => setPtoForm({ ...ptoForm, start_date: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>End</label><input type="date" value={ptoForm.end_date} onChange={(e) => setPtoForm({ ...ptoForm, end_date: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Type</label><select value={ptoForm.request_type} onChange={(e) => setPtoForm({ ...ptoForm, request_type: e.target.value })} style={inputStyle}><option value="pto">🏖️ PTO</option><option value="sick">🤒 Sick</option><option value="personal">👤 Personal</option><option value="unpaid">💰 Unpaid</option></select></div>
              <div><label style={labelStyle}>Reason</label><textarea value={ptoForm.reason} onChange={(e) => setPtoForm({ ...ptoForm, reason: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Optional" /></div>
              {ptoForm.start_date && ptoForm.end_date && <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center' }}><span style={{ color: theme.text, fontSize: '18px', fontWeight: '700' }}>{calcBusinessDays(ptoForm.start_date, ptoForm.end_date)} business days</span></div>}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowPTOModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={submitPTORequest} disabled={submittingPTO || !ptoForm.start_date || !ptoForm.end_date} style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', opacity: submittingPTO || !ptoForm.start_date || !ptoForm.end_date ? 0.6 : 1 }}>{submittingPTO ? 'Submitting...' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Details Editor Modal (Gusto-style) */}
      {showCommissionModal && selectedEmployeeForComm && (() => {
        const empId = selectedEmployeeForComm.id;
        const payData = calculatePayroll(empId, periodStart, periodEnd);
        const empCommissions = commissions.filter(c => {
          const d = new Date(c.created_at);
          return c.employee_id === empId && d >= periodStart && d <= periodEnd;
        });

        const adjustments = payAdjustments[empId] || { bonus: 0, reimbursement: 0, hoursOverride: null };
        const effectiveHours = adjustments.hoursOverride !== null ? parseFloat(adjustments.hoursOverride) : payData.totalHours;
        const bonusAmount = parseFloat(adjustments.bonus) || 0;
        const reimbursementAmount = parseFloat(adjustments.reimbursement) || 0;

        // Recalculate with overrides
        const payTypes = Array.isArray(selectedEmployeeForComm.pay_type) ? selectedEmployeeForComm.pay_type : [selectedEmployeeForComm.pay_type || 'hourly'];
        const regularHours = Math.min(effectiveHours, 40 * (paySettings.pay_frequency === 'weekly' ? 1 : 2));
        const overtimeHours = Math.max(0, effectiveHours - regularHours);
        let basePay = 0;
        if (payTypes.includes('hourly')) basePay = (regularHours * (selectedEmployeeForComm.hourly_rate || 0)) + (overtimeHours * (selectedEmployeeForComm.hourly_rate || 0) * 1.5);
        if (payTypes.includes('salary')) {
          const periods = paySettings.pay_frequency === 'weekly' ? 52 : paySettings.pay_frequency === 'bi-weekly' ? 26 : paySettings.pay_frequency === 'semi-monthly' ? 24 : 12;
          basePay += (selectedEmployeeForComm.salary || 0) / periods;
        }

        const totalGross = basePay + payData.commissionAmount + bonusAmount;
        const federalTax = totalGross * 0.12;
        const stateTax = totalGross * 0.0495;
        const socialSecurity = totalGross * 0.062;
        const medicare = totalGross * 0.0145;
        const totalDeductions = federalTax + stateTax + socialSecurity + medicare;
        const netPay = totalGross + reimbursementAmount - totalDeductions;

        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '700px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              {/* Header */}
              <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ color: theme.text, fontSize: '22px', fontWeight: '700', margin: 0 }}>{selectedEmployeeForComm.name}</h2>
                    <p style={{ color: theme.textSecondary, fontSize: '13px', marginTop: '4px' }}>{formatDate(periodStart)} - {formatDate(periodEnd)} · Pay Date: {formatDate(nextPayDate)}</p>
                  </div>
                  <button onClick={() => setShowCommissionModal(false)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '28px', cursor: 'pointer', lineHeight: '1' }}>×</button>
                </div>
              </div>

              {/* Pay Summary */}
              <div style={{ padding: '20px 24px', backgroundColor: theme.bg }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>GROSS PAY</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(totalGross)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>NET PAY</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>{formatCurrency(netPay)}</div>
                  </div>
                </div>
              </div>

              {/* Pay Details */}
              <div style={{ padding: '24px' }}>
                {/* Hours */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>⏰ Hours</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Total Hours (calculated: {payData.totalHours.toFixed(1)})</label>
                      <input type="number" step="0.1" value={adjustments.hoursOverride !== null ? adjustments.hoursOverride : payData.totalHours} onChange={(e) => setPayAdjustments({...payAdjustments, [empId]: {...adjustments, hoursOverride: e.target.value}})} style={{ ...inputStyle, fontWeight: '600' }} />
                    </div>
                    <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>BREAKDOWN</div>
                      <div style={{ fontSize: '14px', color: theme.text, marginTop: '4px' }}>
                        Regular: {regularHours.toFixed(1)}hrs
                        {overtimeHours > 0 && <span style={{ color: '#ef4444' }}> · OT: {overtimeHours.toFixed(1)}hrs</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Commissions */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>💰 Commissions ({empCommissions.length})</div>
                  {empCommissions.length === 0 ? (
                    <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No commissions this period</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {empCommissions.map(comm => (
                        <div key={comm.id} style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>Vehicle Sale</div>
                            <div style={{ color: theme.textMuted, fontSize: '11px' }}>{formatDateFull(comm.created_at)}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: '#8b5cf6' }}>{formatCurrency(comm.amount)}</div>
                            <button onClick={() => deleteCommission(comm.id)} style={{ padding: '4px 8px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: '12px', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#8b5cf6' }}>Total Commissions</span>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: '#8b5cf6' }}>{formatCurrency(payData.commissionAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bonus & Reimbursement */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>💵 Additional Pay</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Bonus (taxable)</label>
                      <input type="number" step="0.01" value={adjustments.bonus || ''} onChange={(e) => setPayAdjustments({...payAdjustments, [empId]: {...adjustments, bonus: e.target.value}})} placeholder="0.00" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Reimbursement (non-taxable)</label>
                      <input type="number" step="0.01" value={adjustments.reimbursement || ''} onChange={(e) => setPayAdjustments({...payAdjustments, [empId]: {...adjustments, reimbursement: e.target.value}})} placeholder="0.00" style={inputStyle} />
                    </div>
                  </div>
                </div>

                {/* Pay Breakdown */}
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px' }}>PAY BREAKDOWN</div>
                  <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary }}>Base Pay ({effectiveHours.toFixed(1)}hrs)</span>
                      <span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(basePay)}</span>
                    </div>
                    {payData.commissionAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: theme.textSecondary }}>Commissions</span>
                        <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{formatCurrency(payData.commissionAmount)}</span>
                      </div>
                    )}
                    {bonusAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: theme.textSecondary }}>Bonus</span>
                        <span style={{ color: '#22c55e', fontWeight: '600' }}>{formatCurrency(bonusAmount)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.text, fontWeight: '600' }}>Gross Pay</span>
                      <span style={{ color: '#22c55e', fontWeight: '700', fontSize: '16px' }}>{formatCurrency(totalGross)}</span>
                    </div>
                    {reimbursementAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                        <span style={{ color: theme.textSecondary }}>Reimbursement</span>
                        <span style={{ color: '#3b82f6', fontWeight: '600' }}>{formatCurrency(reimbursementAmount)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '8px', marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>DEDUCTIONS</div>
                      <div style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Federal Tax (12%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(federalTax)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>State Tax (4.95%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(stateTax)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Social Security (6.2%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(socialSecurity)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Medicare (1.45%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(medicare)}</span></div>
                      </div>
                    </div>
                    <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '12px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>Net Pay</span>
                      <span style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{formatCurrency(netPay)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <button onClick={() => {
                  setPayAdjustments({...payAdjustments, [empId]: { bonus: 0, reimbursement: 0, hoursOverride: null }});
                }} style={{ padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  Reset
                </button>
                <button onClick={() => setShowCommissionModal(false)} style={{ ...buttonStyle, padding: '10px 24px' }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}