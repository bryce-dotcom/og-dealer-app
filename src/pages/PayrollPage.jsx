import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';
import { CreditService } from '../lib/creditService';

// ---------------------------------------------------------------------------
// Date helpers. Everything here is LOCAL time. Never use toISOString() for a
// date-only value: in the US it turns a late-evening local time into
// tomorrow's UTC date.
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYMD = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// Workweek = Sunday 12:00 AM through Saturday 11:59 PM, local time.
const startOfWorkweek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; };
const round2 = (n) => Math.round((Number(n) || 0) * 100 + (n >= 0 ? Number.EPSILON : -Number.EPSILON)) / 100;

// ---------------------------------------------------------------------------
// Pay rules
// ---------------------------------------------------------------------------
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const FREQUENCIES = ['weekly', 'bi-weekly', 'semi-monthly', 'monthly'];
const PERIODS_PER_YEAR = { weekly: 52, 'bi-weekly': 26, 'semi-monthly': 24, monthly: 12 };
const OVERTIME_AFTER_HOURS = 40; // federal rule: hours over 40 in one workweek
const OVERTIME_MULTIPLIER = 1.5;
const LONG_SHIFT_HOURS = 12;
// Flat-rate ESTIMATES only. These are not IRS/state withholding tables.
const EST_TAX_RATES = { federal: 0.12, state: 0.0495, socialSecurity: 0.062, medicare: 0.0145 };
const EMPTY_ADJ = { bonus: '', reimbursement: '', regularOverride: null, overtimeOverride: null };
const LOOKBACK_DAYS = 75; // enough to cover a monthly period plus the workweek it starts in

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

function getOrdinal(n) {
  const num = parseInt(n, 10);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

// dealer_settings stores the schedule in: pay_frequency (text), pay_day (text), next_pay_date (date).
//   weekly       -> pay_day = weekday name, e.g. "friday"
//   bi-weekly    -> pay_day = weekday name; next_pay_date = a known payday (paydays repeat every 14 days from it)
//   semi-monthly -> pay_day = "5,20" (1st payday covers the 16th-end of last month, 2nd covers the 1st-15th)
//   monthly      -> pay_day = "20" (covers all of last month)
function readPaySchedule(dealer) {
  const freq = FREQUENCIES.includes(dealer?.pay_frequency) ? dealer.pay_frequency : 'bi-weekly';
  const raw = String(dealer?.pay_day || '').trim().toLowerCase();
  const nums = raw.split(',').map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  const s = { pay_frequency: freq, weekday: 'friday', semi_day_1: 5, semi_day_2: 20, monthly_day: 20, next_pay_date: dealer?.next_pay_date || '' };
  if (WEEKDAYS.includes(raw)) s.weekday = raw;
  if (freq === 'semi-monthly' && nums.length === 2 && nums[0] >= 1 && nums[0] <= 10 && nums[1] >= 15 && nums[1] <= 25) {
    s.semi_day_1 = nums[0];
    s.semi_day_2 = nums[1];
  }
  if (freq === 'monthly' && nums.length >= 1 && nums[0] >= 1 && nums[0] <= 28) s.monthly_day = nums[0];
  if (freq === 'bi-weekly') {
    const anchor = parseYMD(s.next_pay_date);
    if (anchor) s.weekday = WEEKDAYS[anchor.getDay()];
  }
  return s;
}

function encodePayDay(s) {
  if (s.pay_frequency === 'semi-monthly') return `${s.semi_day_1},${s.semi_day_2}`;
  if (s.pay_frequency === 'monthly') return String(s.monthly_day);
  return s.weekday;
}

// The pay period shown and paid is the one for the next payday on or after today.
// Returns { payDate, start (00:00:00), end (23:59:59.999) } in local time.
function getPayPeriod(s, today = new Date()) {
  const t = startOfDay(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const day = t.getDate();
  let payDate;
  let start;
  let end;

  if (s.pay_frequency === 'weekly' || s.pay_frequency === 'bi-weekly') {
    const wd = Math.max(0, WEEKDAYS.indexOf(s.weekday));
    const anchor = s.pay_frequency === 'bi-weekly' ? parseYMD(s.next_pay_date) : null;
    if (anchor) {
      const diffDays = Math.round((t - anchor) / 86400000);
      payDate = addDays(anchor, Math.ceil(diffDays / 14) * 14);
    } else {
      payDate = addDays(t, (wd - t.getDay() + 7) % 7);
    }
    // Period ends on the Saturday before payday (the end of the last full workweek).
    const back = ((payDate.getDay() + 1) % 7) || 7;
    end = addDays(payDate, -back);
    start = addDays(end, s.pay_frequency === 'weekly' ? -6 : -13);
  } else if (s.pay_frequency === 'semi-monthly') {
    const d1 = s.semi_day_1;
    const d2 = s.semi_day_2;
    if (day <= d1) {
      payDate = new Date(y, m, d1); start = new Date(y, m - 1, 16); end = new Date(y, m, 0);
    } else if (day <= d2) {
      payDate = new Date(y, m, d2); start = new Date(y, m, 1); end = new Date(y, m, 15);
    } else {
      payDate = new Date(y, m + 1, d1); start = new Date(y, m, 16); end = new Date(y, m + 1, 0);
    }
  } else {
    const p = s.monthly_day;
    if (day <= p) {
      payDate = new Date(y, m, p); start = new Date(y, m - 1, 1); end = new Date(y, m, 0);
    } else {
      payDate = new Date(y, m + 1, p); start = new Date(y, m, 1); end = new Date(y, m + 1, 0);
    }
  }
  return { payDate: startOfDay(payDate), start: startOfDay(start), end: endOfDay(end) };
}

function describeSchedule(s) {
  if (s.pay_frequency === 'weekly') return `Every ${capitalize(s.weekday)}`;
  if (s.pay_frequency === 'bi-weekly') return `Every other ${capitalize(s.weekday)}`;
  if (s.pay_frequency === 'semi-monthly') return `${getOrdinal(s.semi_day_1)} & ${getOrdinal(s.semi_day_2)} of each month`;
  return `${getOrdinal(s.monthly_day)} of each month`;
}

// Overtime is figured per workweek (Sun-Sat), never per pay period.
// `entries` = one employee's finished shifts from the start of the workweek that
// contains `start` through `end`. Shifts before `start` (same week) count toward
// that week's 40 hours but are not paid again here - they belong to the previous period.
// Within a week, hours are counted in time order: the first 40 are regular, the rest overtime.
function splitHoursByWorkweek(entries, start, end) {
  const byWeek = new Map();
  entries.forEach((e) => {
    const key = toYMD(startOfWorkweek(new Date(e.clock_in)));
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(e);
  });
  let regular = 0;
  let overtime = 0;
  const weeks = [];
  [...byWeek.keys()].sort().forEach((key) => {
    const list = byWeek.get(key).slice().sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));
    let running = 0;
    let wkReg = 0;
    let wkOt = 0;
    list.forEach((e) => {
      const h = Math.max(0, Number(e.total_hours) || 0);
      const reg = Math.max(0, Math.min(h, OVERTIME_AFTER_HOURS - running));
      const ot = h - reg;
      running += h;
      const t = new Date(e.clock_in);
      if (t >= start && t <= end) { wkReg += reg; wkOt += ot; }
    });
    if (wkReg + wkOt > 0) weeks.push({ weekStart: key, regular: wkReg, overtime: wkOt, weekTotal: running });
    regular += wkReg;
    overtime += wkOt;
  });
  return { regular, overtime, total: regular + overtime, weeks };
}

function normalizePayTypes(pt) {
  if (Array.isArray(pt)) return pt;
  if (pt) return [pt];
  return ['hourly'];
}

// THE pay calculation. Every screen, the CSV export and Run Payroll use this.
function calculatePay({ emp, hours, commissionAmount, adj, frequency }) {
  const a = adj || EMPTY_ADJ;
  const pick = (override, calculated) => (override === null || override === undefined ? calculated : Math.max(0, parseFloat(override) || 0));
  const payTypes = normalizePayTypes(emp?.pay_type);
  const rate = Number(emp?.hourly_rate) || 0;
  const regularHours = pick(a.regularOverride, hours.regular);
  const overtimeHours = pick(a.overtimeOverride, hours.overtime);
  const hourlyPay = payTypes.includes('hourly') ? regularHours * rate + overtimeHours * rate * OVERTIME_MULTIPLIER : 0;
  const salaryPay = payTypes.includes('salary') ? (Number(emp?.salary) || 0) / (PERIODS_PER_YEAR[frequency] || 26) : 0;
  const bonus = Math.max(0, parseFloat(a.bonus) || 0);
  const reimbursement = Math.max(0, parseFloat(a.reimbursement) || 0);
  const basePay = round2(hourlyPay + salaryPay);
  const commission = round2(commissionAmount);
  const grossPay = round2(basePay + commission + bonus);
  const is1099 = emp?.employment_type === '1099';
  const taxable = is1099 ? 0 : Math.max(0, grossPay);
  const federalTax = round2(taxable * EST_TAX_RATES.federal);
  const stateTax = round2(taxable * EST_TAX_RATES.state);
  const socialSecurity = round2(taxable * EST_TAX_RATES.socialSecurity);
  const medicare = round2(taxable * EST_TAX_RATES.medicare);
  const totalTaxes = round2(federalTax + stateTax + socialSecurity + medicare);
  const netPay = round2(grossPay + reimbursement - totalTaxes);
  return {
    payTypes, rate, regularHours, overtimeHours, totalHours: regularHours + overtimeHours,
    hoursOverridden: a.regularOverride !== null || a.overtimeOverride !== null,
    basePay, commissionAmount: commission, bonus, reimbursement, grossPay, is1099,
    federalTax, stateTax, socialSecurity, medicare, totalTaxes, netPay
  };
}

function calcBusinessDays(s, e) {
  const start = parseYMD(s);
  const end = parseYMD(e);
  if (!start || !end || end < start) return 0;
  let days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0 && d.getDay() !== 6) days++;
  return days;
}

export default function PayrollPage() {
  const { dealerId, dealer, employees, refreshEmployees, setDealer } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  // Access control state
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [timeEntries, setTimeEntries] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
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

  const paySettings = readPaySchedule(dealer);
  const isAdmin = !currentUserId;
  const currentEmployee = currentUserId ? employees.find(e => e.id === currentUserId) : null;

  // Check user access on mount
  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: dealerData } = await supabase
          .from('dealer_settings')
          .select('owner_user_id')
          .eq('id', dealerId)
          .maybeSingle();
        // Only the dealership owner can see payroll.
        setHasAccess(dealerData?.owner_user_id === session.user.id);
      }
      setCheckingAccess(false);
    }
    if (dealerId) checkAccess();
  }, [dealerId]);

  useEffect(() => {
    if (dealerId && hasAccess) { fetchTimeEntries(); fetchCommissions(); fetchPTORequests(); fetchPayrollRuns(); }
  }, [dealerId, hasAccess]);

  useEffect(() => {
    if (!dealerId || !hasAccess) return;
    if (currentUserId) fetchPaystubs(currentUserId);
    else fetchPaystubs();
  }, [currentUserId, dealerId, hasAccess]);

  async function fetchTimeEntries() {
    setLoading(true);
    const since = startOfDay(addDays(new Date(), -LOOKBACK_DAYS));
    const { data, error } = await supabase.from('time_clock').select('*')
      .eq('dealer_id', dealerId).gte('clock_in', since.toISOString()).order('clock_in', { ascending: true });
    if (error) setLoadError('Could not load time clock hours: ' + error.message);
    else setTimeEntries(data || []);
    setLoading(false);
  }

  async function fetchCommissions() {
    const since = startOfDay(addDays(new Date(), -LOOKBACK_DAYS));
    const { data, error } = await supabase.from('inventory_commissions').select('*')
      .eq('dealer_id', dealerId).gte('created_at', since.toISOString()).order('created_at', { ascending: false });
    if (error) setLoadError('Could not load commissions: ' + error.message);
    else setCommissions(data || []);
  }

  async function fetchPTORequests() {
    const { data, error } = await supabase.from('time_off_requests').select('*, employees(name)')
      .eq('dealer_id', dealerId).order('created_at', { ascending: false });
    if (error) setLoadError('Could not load time-off requests: ' + error.message);
    else setPtoRequests(data || []);
  }

  async function fetchPayrollRuns() {
    const { data, error } = await supabase.from('payroll_runs').select('*')
      .eq('dealer_id', dealerId).order('pay_date', { ascending: false }).limit(10);
    if (error) setLoadError('Could not load past payroll runs: ' + error.message);
    else setPayrollRuns(data || []);
  }

  async function fetchPaystubs(employeeId = null) {
    let query = supabase.from('paystubs').select('*').eq('dealer_id', dealerId).order('pay_date', { ascending: false });
    if (employeeId) query = query.eq('employee_id', employeeId);
    const { data, error } = await query.limit(50);
    if (error) setLoadError('Could not load paystubs: ' + error.message);
    else setPaystubs(data || []);
  }

  // ---------------- Pay schedule ----------------
  function openScheduleModal() {
    const draft = { ...paySettings };
    if (draft.pay_frequency === 'bi-weekly' && !parseYMD(draft.next_pay_date)) {
      draft.next_pay_date = toYMD(getPayPeriod(draft).payDate);
    }
    setScheduleDraft(draft);
    setScheduleError('');
    setShowSettings(true);
  }

  function updateDraft(changes) {
    const next = { ...scheduleDraft, ...changes };
    if (next.pay_frequency === 'bi-weekly') {
      if (!parseYMD(next.next_pay_date)) next.next_pay_date = toYMD(getPayPeriod({ ...next, next_pay_date: '' }).payDate);
      next.weekday = WEEKDAYS[parseYMD(next.next_pay_date).getDay()];
    }
    setScheduleDraft(next);
  }

  async function savePaySettings() {
    const draft = { ...scheduleDraft };
    if (draft.pay_frequency === 'bi-weekly') {
      const anchor = parseYMD(draft.next_pay_date);
      if (!anchor) { setScheduleError('Pick your next payday.'); return; }
      draft.weekday = WEEKDAYS[anchor.getDay()];
    }
    const payload = {
      pay_frequency: draft.pay_frequency,
      pay_day: encodePayDay(draft),
      next_pay_date: draft.pay_frequency === 'bi-weekly' ? draft.next_pay_date : toYMD(getPayPeriod(draft).payDate)
    };
    setSavingSettings(true);
    setScheduleError('');
    const { data, error } = await supabase.from('dealer_settings').update(payload).eq('id', dealerId).select().maybeSingle();
    setSavingSettings(false);
    if (error) { setScheduleError('Could not save the pay schedule: ' + error.message); return; }
    if (!data) { setScheduleError('Could not save the pay schedule: your login is not allowed to change dealership settings.'); return; }
    setDealer(data);
    setShowSettings(false);
  }

  // ---------------- Current period ----------------
  const { payDate: nextPayDate, start: periodStart, end: periodEnd } = getPayPeriod(paySettings);
  const periodStartStr = toYMD(periodStart);
  const periodEndStr = toYMD(periodEnd);
  const weekOfPeriodStart = startOfWorkweek(periodStart);
  const inPeriod = (ts) => { const d = new Date(ts); return d >= periodStart && d <= periodEnd; };

  function getEmployeePay(emp) {
    const shifts = timeEntries.filter(e => {
      if (e.employee_id !== emp.id || !e.clock_out || e.total_hours == null) return false;
      const d = new Date(e.clock_in);
      return d >= weekOfPeriodStart && d <= periodEnd;
    });
    const hours = splitHoursByWorkweek(shifts, periodStart, periodEnd);
    const empCommissions = commissions.filter(c => c.employee_id === emp.id && inPeriod(c.created_at));
    const commissionAmount = empCommissions.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
    const pay = calculatePay({ emp, hours, commissionAmount, adj: payAdjustments[emp.id], frequency: paySettings.pay_frequency });
    return { ...pay, weeks: hours.weeks, calculatedRegular: hours.regular, calculatedOvertime: hours.overtime, commissions: empCommissions };
  }

  const activeEmployees = employees.filter(e => e.active);
  const payByEmployee = {};
  activeEmployees.forEach(emp => { payByEmployee[emp.id] = getEmployeePay(emp); });
  const totalPayroll = round2(activeEmployees.reduce((sum, emp) => sum + payByEmployee[emp.id].grossPay, 0));

  const periodShifts = timeEntries.filter(e => inPeriod(e.clock_in));
  const openShifts = periodShifts.filter(e => !e.clock_out);
  const longShifts = periodShifts.filter(e => e.clock_out && Number(e.total_hours) > LONG_SHIFT_HOURS);
  const periodNotOver = new Date() < periodEnd;
  const alreadyRun = payrollRuns.find(r => r.pay_period_start <= periodEndStr && r.pay_period_end >= periodStartStr);
  const negativePay = activeEmployees.filter(emp => payByEmployee[emp.id].grossPay < 0);
  const employeeName = (id) => employees.find(e => e.id === id)?.name || 'Unknown';

  // ---------------- Run payroll ----------------
  async function runPayroll() {
    if (runningPayroll) return;
    if (periodNotOver && !confirm(`This pay period doesn't end until ${formatDateFull(periodEnd)}.\n\nHours worked after right now will NOT be on these paystubs, and you won't be able to run payroll for this period again.\n\nRun it anyway?`)) return;

    setRunningPayroll(true);
    try {
      // 1. Block a second run for the same (or an overlapping) period.
      const { data: existing, error: existingError } = await supabase.from('payroll_runs')
        .select('id, pay_period_start, pay_period_end, pay_date')
        .eq('dealer_id', dealerId)
        .lte('pay_period_start', periodEndStr)
        .gte('pay_period_end', periodStartStr);
      if (existingError) throw new Error('Could not check for earlier payroll runs, so nothing was created: ' + existingError.message);
      if (existing && existing.length > 0) {
        const r = existing[0];
        alert(`Payroll was already run for ${formatDateFull(r.pay_period_start)} – ${formatDateFull(r.pay_period_end)} (pay date ${formatDateFull(r.pay_date)}).\n\nThis period overlaps it, so running again would pay the same hours twice. Nothing was created.`);
        await fetchPayrollRuns();
        return;
      }

      // 2. Credits
      const creditCheck = await CreditService.checkCredits(dealerId, 'PAYROLL_RUN');
      if (!creditCheck.success) {
        if (creditCheck.rate_limited) {
          alert(`Rate limit reached. Try again at ${new Date(creditCheck.next_allowed_at).toLocaleTimeString()}`);
        } else {
          alert(creditCheck.message || creditCheck.error || 'Unable to run payroll');
        }
        return;
      }
      if (creditCheck.warning) console.warn(creditCheck.warning);

      // 3. Build every paystub first (same math as the screen).
      const payDateStr = toYMD(nextPayDate);
      const stubs = [];
      const skipped = [];
      activeEmployees.forEach(emp => {
        const pay = payByEmployee[emp.id];
        if (pay.grossPay < 0) { skipped.push(`${emp.name} – pay came out negative (check their commissions)`); return; }
        if (pay.grossPay === 0 && pay.reimbursement === 0) { skipped.push(`${emp.name} – $0 this period`); return; }
        stubs.push({
          employee_id: emp.id,
          pay_period_start: periodStartStr,
          pay_period_end: periodEndStr,
          pay_date: payDateStr,
          regular_hours: round2(pay.regularHours),
          overtime_hours: round2(pay.overtimeHours),
          hourly_rate: pay.rate,
          salary_amount: Number(emp.salary) || 0,
          commission_amount: pay.commissionAmount,
          bonus_amount: round2(pay.bonus),
          reimbursement_amount: round2(pay.reimbursement),
          gross_pay: pay.grossPay,
          federal_tax: pay.federalTax,
          state_tax: pay.stateTax,
          social_security: pay.socialSecurity,
          medicare: pay.medicare,
          net_pay: pay.netPay,
          notes: 'Taxes are flat-rate estimates, not official withholding.',
          status: 'generated',
          dealer_id: dealerId
        });
      });
      if (stubs.length === 0) {
        alert('Nobody has pay for this period, so no paystubs were created.' + (skipped.length ? `\n\n• ${skipped.join('\n• ')}` : ''));
        return;
      }
      const totalGross = round2(stubs.reduce((s, p) => s + p.gross_pay, 0));
      const totalNet = round2(stubs.reduce((s, p) => s + p.net_pay, 0));

      // 4. Save the run with its real totals.
      const { data: runData, error: runError } = await supabase.from('payroll_runs').insert({
        pay_period_start: periodStartStr,
        pay_period_end: periodEndStr,
        pay_date: payDateStr,
        employee_count: stubs.length,
        total_gross: totalGross,
        total_net: totalNet,
        status: 'finalized',
        dealer_id: dealerId
      }).select().single();
      if (runError) throw new Error('Could not save the payroll run. Nothing was created. ' + runError.message);

      // 5. Save all paystubs in one insert (all or nothing). Undo the run if it fails.
      const { error: stubError } = await supabase.from('paystubs').insert(stubs);
      if (stubError) {
        const { error: undoError } = await supabase.from('payroll_runs').delete().eq('id', runData.id).eq('dealer_id', dealerId);
        throw new Error('Could not save the paystubs: ' + stubError.message + (undoError
          ? `\n\nAlso could not remove the unfinished payroll run (#${runData.id}): ${undoError.message}. Contact support before trying again.`
          : '\n\nNothing was saved. You can try again.'));
      }

      // 6. Charge credits only after everything saved.
      try {
        await CreditService.consumeCredits(dealerId, 'PAYROLL_RUN', runData.id.toString(), {
          payroll_run_id: runData.id,
          employee_count: stubs.length,
          total_gross: totalGross,
          pay_period: `${periodStartStr} to ${periodEndStr}`
        });
      } catch (creditErr) {
        console.warn('Payroll saved but credit usage was not recorded:', creditErr);
      }

      await Promise.all([fetchPayrollRuns(), fetchPaystubs(currentUserId || null)]);
      setPayAdjustments({});
      setShowRunPayrollModal(false);
      alert(`Payroll saved. ${stubs.length} paystub${stubs.length === 1 ? '' : 's'} created.` + (skipped.length ? `\n\nNo paystub for:\n• ${skipped.join('\n• ')}` : ''));
    } catch (err) {
      alert(err.message);
    } finally {
      setRunningPayroll(false);
    }
  }

  function exportToCSV() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['Employee Name', 'Email', 'Pay Type', 'Regular Hours', 'OT Hours', 'Hourly Rate', 'Annual Salary', 'Commission', 'Bonus', 'Reimbursement', 'Gross Pay', 'Period Start', 'Period End', 'Pay Date'];
    const rows = activeEmployees.map(emp => {
      const pay = payByEmployee[emp.id];
      return [emp.name, emp.email || '', pay.payTypes.join('+'), pay.regularHours.toFixed(2), pay.overtimeHours.toFixed(2),
        emp.hourly_rate || 0, emp.salary || 0, pay.commissionAmount.toFixed(2), pay.bonus.toFixed(2), pay.reimbursement.toFixed(2),
        pay.grossPay.toFixed(2), periodStartStr, periodEndStr, toYMD(nextPayDate)
      ].map(esc).join(',');
    });
    const csv = [headers.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${periodStartStr}_to_${periodEndStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------- Time off ----------------
  async function submitPTORequest() {
    if (!currentUserId || !ptoForm.start_date || !ptoForm.end_date) return;
    if (ptoForm.end_date < ptoForm.start_date) { alert('The end date is before the start date.'); return; }
    setSubmittingPTO(true);
    const days = calcBusinessDays(ptoForm.start_date, ptoForm.end_date);
    const { error } = await supabase.from('time_off_requests').insert({
      employee_id: currentUserId, start_date: ptoForm.start_date, end_date: ptoForm.end_date,
      days_requested: days, request_type: ptoForm.request_type, reason: ptoForm.reason, dealer_id: dealerId
    });
    setSubmittingPTO(false);
    if (error) { alert('Could not send the time-off request: ' + error.message); return; }
    setShowPTOModal(false);
    setPtoForm({ start_date: '', end_date: '', request_type: 'pto', reason: '' });
    fetchPTORequests();
  }

  async function handlePTOAction(request, action) {
    setProcessingRequestId(request.id);
    try {
      // Mark the request first (only if still pending) so a retry can never deduct PTO twice.
      const { data: updated, error: statusError } = await supabase.from('time_off_requests')
        .update({ status: action, approved_at: new Date().toISOString() })
        .eq('id', request.id).eq('dealer_id', dealerId).eq('status', 'pending')
        .select('id');
      if (statusError) throw new Error('Could not update the request: ' + statusError.message);
      if (!updated || updated.length === 0) throw new Error('This request was already handled or could not be changed. The list has been refreshed.');

      if (action === 'approved' && request.request_type === 'pto') {
        const { data: fresh, error: readError } = await supabase.from('employees')
          .select('pto_used').eq('id', request.employee_id).eq('dealer_id', dealerId).maybeSingle();
        if (readError || !fresh) throw new Error(`The request was approved, but the PTO balance could not be updated${readError ? ': ' + readError.message : ''}. Update their PTO used on the Team page.`);
        const { error: ptoError } = await supabase.from('employees')
          .update({ pto_used: (Number(fresh.pto_used) || 0) + (Number(request.days_requested) || 0) })
          .eq('id', request.employee_id).eq('dealer_id', dealerId);
        if (ptoError) throw new Error(`The request was approved, but the PTO balance could not be updated: ${ptoError.message}. Update their PTO used on the Team page.`);
        if (refreshEmployees) await refreshEmployees();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      await fetchPTORequests();
      setProcessingRequestId(null);
    }
  }

  async function deleteCommission(comm) {
    const ok = confirm(`Permanently delete this ${formatCurrency(comm.amount)} commission?\n\nThis deletes the commission record itself. It will also disappear from the vehicle in Inventory and from the Commissions page. This can't be undone.`);
    if (!ok) return;
    const { error } = await supabase.from('inventory_commissions').delete().eq('id', comm.id).eq('dealer_id', dealerId);
    if (error) { alert('Could not delete the commission: ' + error.message); return; }
    await fetchCommissions();
  }

  function openCommissionModal(emp) {
    setSelectedEmployeeForComm(emp);
    setShowCommissionModal(true);
  }

  const getPTOBalance = (emp) => Math.max(0, (Number(emp?.pto_accrued) || 0) - (Number(emp?.pto_used) || 0));
  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amt) || 0);
  const toDisplayDate = (d) => (d instanceof Date ? d : (parseYMD(d) && String(d).length <= 10 ? parseYMD(d) : new Date(d)));
  function formatDate(d) { return d ? toDisplayDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'; }
  function formatDateFull(d) { return d ? toDisplayDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'; }

  const daysUntilPay = Math.max(0, Math.round((nextPayDate - startOfDay(new Date())) / 86400000));
  const displayEmployees = isAdmin ? activeEmployees : (currentEmployee ? [currentEmployee] : []);
  const pendingRequests = ptoRequests.filter(r => r.status === 'pending');
  const myRequests = ptoRequests.filter(r => r.employee_id === currentUserId);
  const myPaystubs = paystubs.filter(p => p.employee_id === currentUserId);

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' };
  const labelStyle = { display: 'block', fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', fontWeight: '500' };
  const buttonStyle = { padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' };
  const warnBox = { padding: '10px 12px', backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '8px', color: '#eab308', fontSize: '13px' };

  if (checkingAccess) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', backgroundColor: theme.bg, minHeight: '100vh' }}>
        <div style={{ fontSize: '14px', color: theme.textMuted }}>Checking access...</div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center', backgroundColor: theme.bg, minHeight: '100vh' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 8px', color: theme.text }}>Access Denied</h2>
        <p style={{ color: theme.textMuted, fontSize: '14px', maxWidth: '400px', margin: '0 auto' }}>
          You don't have permission to view the Payroll page. Only the dealership owner can see payroll.
        </p>
      </div>
    );
  }

  const draftPeriod = scheduleDraft ? getPayPeriod(scheduleDraft) : null;

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>Payroll</h1>
          <p style={{ color: theme.textSecondary, fontSize: '14px', marginTop: '4px' }}>Check hours and pay for the current pay period, then run payroll to create paystubs.</p>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '2px' }}>Payday: {describeSchedule(paySettings)} · This period: {formatDate(periodStart)} – {formatDate(periodEnd)}</p>
          {paySettings.pay_frequency === 'bi-weekly' && !parseYMD(paySettings.next_pay_date) && (
            <p style={{ color: '#eab308', fontSize: '12px', marginTop: '4px' }}>Set your next payday in ⚙️ Pay Schedule so every-other-week paydays land on the right week.</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={currentUserId || ''} onChange={(e) => setCurrentUserId(e.target.value ? parseInt(e.target.value, 10) : null)} style={{ ...inputStyle, width: '180px', backgroundColor: theme.bgCard }}>
            <option value="">👑 Admin View</option>
            {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>👤 {emp.name}</option>)}
          </select>
          {isAdmin && (
            <>
              <button onClick={openScheduleModal} title="Pay schedule" style={{ ...buttonStyle, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, color: theme.text }}>⚙️</button>
              <button onClick={exportToCSV} style={{ ...buttonStyle, backgroundColor: '#3b82f6' }}>📊 Export</button>
              <button onClick={() => setShowRunPayrollModal(true)} style={{ ...buttonStyle, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>▶️ Run Payroll</button>
            </>
          )}
        </div>
      </div>

      {loadError && <div style={{ padding: '12px 16px', marginBottom: '16px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{loadError}</div>}

      {/* Admin Summary */}
      {isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Next Pay Date</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatDate(nextPayDate)}</div>
            <div style={{ fontSize: '13px', color: theme.accent, marginTop: '4px' }}>{daysUntilPay === 0 ? 'Today' : `${daysUntilPay} day${daysUntilPay === 1 ? '' : 's'}`}</div>
          </div>
          <div style={{ padding: '20px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Est. Gross (before taxes)</div>
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

      {isAdmin && alreadyRun && (
        <div style={{ ...warnBox, marginBottom: '16px', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
          ✓ Payroll was already run for {formatDate(alreadyRun.pay_period_start)} – {formatDate(alreadyRun.pay_period_end)} (pay date {formatDate(alreadyRun.pay_date)}). The next period opens after this payday.
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
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{run.employee_count} paystubs</div>
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
                        {formatDate(stub.pay_period_start)} - {formatDate(stub.pay_period_end)} · {(Number(stub.regular_hours) || 0).toFixed(1)}hrs
                        {Number(stub.overtime_hours) > 0 && <span style={{ color: '#ef4444' }}> +{Number(stub.overtime_hours).toFixed(1)} OT</span>}
                        {Number(stub.commission_amount) !== 0 && <span style={{ color: '#8b5cf6' }}> · {formatCurrency(stub.commission_amount)} comm</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(stub.net_pay)}</div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Est. Net Pay</div>
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
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: req.status === 'approved' ? 'rgba(34,197,94,0.2)' : req.status === 'denied' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)', color: req.status === 'approved' ? '#22c55e' : req.status === 'denied' ? '#ef4444' : '#eab308' }}>{(req.status || '').toUpperCase()}</span>
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
            const hasEnough = req.request_type !== 'pto' || ptoBalance >= (Number(req.days_requested) || 0);
            return (
              <div key={req.id} style={{ padding: '16px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '14px', fontWeight: '700' }}>{emp?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                  <div>
                    <div style={{ color: theme.text, fontWeight: '600' }}>{emp?.name || req.employees?.name || 'Unknown'}</div>
                    <div style={{ color: theme.textSecondary, fontSize: '13px' }}>{formatDate(req.start_date)} - {formatDate(req.end_date)} · <strong>{req.days_requested}d</strong> · {(req.request_type || '').toUpperCase()}</div>
                    {req.reason && <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>"{req.reason}"</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {req.request_type === 'pto' && <div style={{ padding: '8px 12px', backgroundColor: hasEnough ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '14px', fontWeight: '700', color: hasEnough ? '#3b82f6' : '#ef4444' }}>{ptoBalance.toFixed(1)}</div><div style={{ fontSize: '10px', color: theme.textMuted }}>BAL</div></div>}
                  <button onClick={() => handlePTOAction(req, 'denied')} disabled={processingRequestId === req.id} style={{ padding: '10px 16px', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: processingRequestId === req.id ? 0.5 : 1 }}>✕ Deny</button>
                  <button onClick={() => handlePTOAction(req, 'approved')} disabled={processingRequestId === req.id || !hasEnough} title={hasEnough ? '' : 'Not enough PTO balance'} style={{ padding: '10px 16px', backgroundColor: hasEnough ? 'rgba(34,197,94,0.15)' : theme.border, color: hasEnough ? '#22c55e' : theme.textMuted, border: `1px solid ${hasEnough ? 'rgba(34,197,94,0.3)' : theme.border}`, borderRadius: '8px', fontWeight: '600', cursor: hasEnough ? 'pointer' : 'not-allowed', opacity: processingRequestId === req.id ? 0.5 : 1 }}>✓ Approve</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payroll List */}
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{isAdmin ? 'Current Period' : 'My Pay'}</h2>
            {isAdmin && <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>Click a person to adjust hours, add a bonus, or see their pay breakdown. OT = overtime: hours over 40 in a Sun–Sat week, paid at 1.5×.</div>}
          </div>
          <span style={{ fontSize: '13px', color: theme.textMuted }}>{formatDate(periodStart)} - {formatDate(periodEnd)}</span>
        </div>
        {loading ? <div style={{ padding: '48px', textAlign: 'center', color: theme.textSecondary }}>Loading...</div> : (
          <div>
            {displayEmployees.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: theme.textMuted }}>No active employees.</div>}
            {displayEmployees.map(emp => {
              const pay = payByEmployee[emp.id] || getEmployeePay(emp);
              return (
                <div key={emp.id} onClick={() => isAdmin && openCommissionModal(emp)} style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', cursor: isAdmin ? 'pointer' : 'default', transition: 'background-color 0.2s' }} onMouseEnter={(e) => isAdmin && (e.currentTarget.style.backgroundColor = theme.bg)} onMouseLeave={(e) => isAdmin && (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px', fontWeight: '700', flexShrink: 0 }}>{emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                  <div style={{ flex: 1, minWidth: '150px' }}>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{emp.name}</div>
                    <div style={{ color: theme.textMuted, fontSize: '13px' }}>{pay.payTypes.map(t => capitalize(t)).join(' + ')}{pay.payTypes.includes('hourly') && ` · ${formatCurrency(emp.hourly_rate)}/hr`}{pay.payTypes.includes('salary') && ` · ${formatCurrency(emp.salary)}/yr`}</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: '80px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: pay.hoursOverridden ? '#f97316' : theme.text }}>{pay.totalHours.toFixed(1)}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>HOURS{pay.hoursOverridden ? ' (edited)' : ''}</div>
                    {pay.overtimeHours > 0 && <div style={{ fontSize: '11px', color: '#ef4444' }}>incl. {pay.overtimeHours.toFixed(1)} OT</div>}
                  </div>
                  {pay.payTypes.includes('commission') && (
                    <div style={{ textAlign: 'center', minWidth: '80px', padding: '8px 12px', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: pay.commissionAmount < 0 ? '#ef4444' : pay.commissionAmount > 0 ? '#8b5cf6' : theme.textMuted }}>{formatCurrency(pay.commissionAmount)}</div>
                      <div style={{ fontSize: '10px', color: '#8b5cf6' }}>COMM</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'center', minWidth: '70px', padding: '8px 12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6' }}>{getPTOBalance(emp).toFixed(1)}</div>
                    <div style={{ fontSize: '10px', color: '#3b82f6' }}>PTO</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '100px' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: pay.grossPay < 0 ? '#ef4444' : pay.bonus > 0 ? '#f97316' : '#22c55e' }}>{formatCurrency(pay.grossPay)}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>GROSS</div>
                    {pay.bonus > 0 && <div style={{ fontSize: '10px', color: '#f97316', marginTop: '2px' }}>+{formatCurrency(pay.bonus)} bonus</div>}
                  </div>
                </div>
              );
            })}
            {isAdmin && <div style={{ padding: '16px 20px', backgroundColor: theme.bg, display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary }}>TOTAL GROSS</span><span style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(totalPayroll)}</span></div>}
          </div>
        )}
      </div>

      {/* Pay Schedule Modal */}
      {showSettings && scheduleDraft && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, maxWidth: '450px', width: '100%', padding: '24px', margin: '16px' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '6px' }}>⚙️ Pay Schedule</h2>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '20px' }}>How often you pay your team, and on what day.</p>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div><label style={labelStyle}>How often</label><select value={scheduleDraft.pay_frequency} onChange={(e) => updateDraft({ pay_frequency: e.target.value })} style={inputStyle}>
                <option value="weekly">Weekly (every week)</option><option value="bi-weekly">Bi-weekly (every other week)</option><option value="semi-monthly">Semi-monthly (twice a month)</option><option value="monthly">Monthly</option>
              </select></div>
              {scheduleDraft.pay_frequency === 'weekly' && (
                <div><label style={labelStyle}>Payday</label><select value={scheduleDraft.weekday} onChange={(e) => updateDraft({ weekday: e.target.value })} style={inputStyle}>{WEEKDAYS.map(d => <option key={d} value={d}>{capitalize(d)}</option>)}</select></div>
              )}
              {scheduleDraft.pay_frequency === 'bi-weekly' && (
                <div>
                  <label style={labelStyle}>Your next payday</label>
                  <input type="date" value={scheduleDraft.next_pay_date || ''} onChange={(e) => updateDraft({ next_pay_date: e.target.value })} style={inputStyle} />
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Paydays repeat every 14 days from this date{parseYMD(scheduleDraft.next_pay_date) ? ` (every other ${capitalize(scheduleDraft.weekday)})` : ''}.</div>
                </div>
              )}
              {scheduleDraft.pay_frequency === 'semi-monthly' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div><label style={labelStyle}>1st Pay Day</label><select value={scheduleDraft.semi_day_1} onChange={(e) => updateDraft({ semi_day_1: parseInt(e.target.value, 10) })} style={inputStyle}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => <option key={d} value={d}>{getOrdinal(d)}</option>)}</select><div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>Pays the 16th–end of last month</div></div>
                  <div><label style={labelStyle}>2nd Pay Day</label><select value={scheduleDraft.semi_day_2} onChange={(e) => updateDraft({ semi_day_2: parseInt(e.target.value, 10) })} style={inputStyle}>{[15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(d => <option key={d} value={d}>{getOrdinal(d)}</option>)}</select><div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>Pays the 1st–15th</div></div>
                </div>
              )}
              {scheduleDraft.pay_frequency === 'monthly' && (
                <div><label style={labelStyle}>Pay Day</label><select value={scheduleDraft.monthly_day} onChange={(e) => updateDraft({ monthly_day: parseInt(e.target.value, 10) })} style={inputStyle}>{[1, 5, 10, 15, 20, 25, 28].map(d => <option key={d} value={d}>{getOrdinal(d)}</option>)}</select><div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>Pays all of last month</div></div>
              )}
              <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', fontSize: '13px' }}>
                <div><span style={{ color: theme.textSecondary }}>Schedule: </span><span style={{ color: theme.text, fontWeight: '600' }}>{describeSchedule(scheduleDraft)}</span></div>
                {draftPeriod && <div style={{ marginTop: '4px' }}><span style={{ color: theme.textSecondary }}>Next payday: </span><span style={{ color: theme.text, fontWeight: '600' }}>{formatDateFull(draftPeriod.payDate)}</span><span style={{ color: theme.textMuted }}> for work {formatDate(draftPeriod.start)} – {formatDate(draftPeriod.end)}</span></div>}
                <div style={{ marginTop: '6px', color: theme.textMuted, fontSize: '12px' }}>Overtime is always figured per week (Sunday–Saturday): hours over 40 in a week are paid at 1.5×.</div>
              </div>
              {scheduleError && <div style={{ padding: '10px 12px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>{scheduleError}</div>}
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
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '500px', width: '100%', padding: '24px', margin: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '700', marginBottom: '8px' }}>▶️ Run Payroll</h2>
            <p style={{ color: theme.textSecondary, fontSize: '14px', marginBottom: '20px' }}>Creates a paystub for everyone with pay this period. You can only run payroll once per period.</p>
            <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '12px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>PERIOD</div><div style={{ fontSize: '16px', color: theme.text, fontWeight: '600' }}>{formatDate(periodStart)} - {formatDate(periodEnd)}</div></div>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>PAY DATE</div><div style={{ fontSize: '16px', color: theme.text, fontWeight: '600' }}>{formatDateFull(nextPayDate)}</div></div>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>EMPLOYEES</div><div style={{ fontSize: '16px', color: theme.text, fontWeight: '600' }}>{activeEmployees.length}</div></div>
              <div><div style={{ fontSize: '11px', color: theme.textMuted }}>EST. GROSS</div><div style={{ fontSize: '16px', color: '#22c55e', fontWeight: '600' }}>{formatCurrency(totalPayroll)}</div></div>
            </div>
            <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
              {alreadyRun && <div style={{ ...warnBox, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>Payroll was already run for {formatDate(alreadyRun.pay_period_start)} – {formatDate(alreadyRun.pay_period_end)}. Running again is blocked so nobody gets paid twice.</div>}
              {periodNotOver && <div style={warnBox}>This pay period isn't over yet (ends {formatDateFull(periodEnd)}). Hours worked after now won't be included.</div>}
              {openShifts.length > 0 && <div style={warnBox}>{openShifts.length} shift{openShifts.length === 1 ? ' has' : 's have'} no clock-out ({[...new Set(openShifts.map(s => employeeName(s.employee_id)))].join(', ')}). Those hours are NOT counted until they clock out.</div>}
              {longShifts.length > 0 && <div style={warnBox}>{longShifts.length} shift{longShifts.length === 1 ? ' is' : 's are'} over {LONG_SHIFT_HOURS} hours ({[...new Set(longShifts.map(s => employeeName(s.employee_id)))].join(', ')}). Someone may have forgotten to clock out. Check before paying.</div>}
              {negativePay.length > 0 && <div style={{ ...warnBox, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>Pay came out negative for {negativePay.map(e => e.name).join(', ')} (commissions on cars sold at a loss). They will be skipped.</div>}
            </div>
            <div style={{ padding: '12px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(59,130,246,0.3)', fontSize: '13px', color: '#3b82f6' }}>Taxes on paystubs are estimated withholding — confirm with your accountant/payroll provider. Paystubs will appear in each employee's profile. Export CSV for Gusto.</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowRunPayrollModal(false)} style={{ ...buttonStyle, flex: 1, backgroundColor: theme.border, color: theme.text }}>Cancel</button>
              <button onClick={runPayroll} disabled={runningPayroll || !!alreadyRun || loading} style={{ ...buttonStyle, flex: 1, background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', opacity: runningPayroll || alreadyRun || loading ? 0.6 : 1, cursor: runningPayroll || alreadyRun || loading ? 'not-allowed' : 'pointer' }}>{runningPayroll ? 'Processing...' : '✓ Run Payroll'}</button>
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
        const emp = selectedEmployeeForComm;
        const empId = emp.id;
        const pay = payByEmployee[empId] || getEmployeePay(emp);
        const adjustments = payAdjustments[empId] || EMPTY_ADJ;
        const setAdj = (changes) => setPayAdjustments({ ...payAdjustments, [empId]: { ...adjustments, ...changes } });

        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, maxWidth: '700px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
              {/* Header */}
              <div style={{ padding: '24px 24px 16px', borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h2 style={{ color: theme.text, fontSize: '22px', fontWeight: '700', margin: 0 }}>{emp.name}</h2>
                      {pay.is1099 && (
                        <span style={{ padding: '4px 10px', backgroundColor: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '6px', fontSize: '11px', fontWeight: '600' }}>1099 CONTRACTOR</span>
                      )}
                    </div>
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
                    <div style={{ fontSize: '28px', fontWeight: '700', color: pay.grossPay < 0 ? '#ef4444' : '#22c55e' }}>{formatCurrency(pay.grossPay)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>EST. NET PAY</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>{formatCurrency(pay.netPay)}</div>
                  </div>
                </div>
              </div>

              {/* Pay Details */}
              <div style={{ padding: '24px' }}>
                {/* Hours */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>⏰ Hours</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>Figured week by week (Sun–Sat). Hours over 40 in a week are overtime (OT), paid at 1.5×.</div>
                  {pay.weeks.length > 0 && (
                    <div style={{ display: 'grid', gap: '4px', marginBottom: '12px' }}>
                      {pay.weeks.map(w => (
                        <div key={w.weekStart} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 10px', backgroundColor: theme.bg, borderRadius: '6px' }}>
                          <span style={{ color: theme.textSecondary }}>Week of {formatDate(w.weekStart)}</span>
                          <span style={{ color: theme.text }}>{(w.regular + w.overtime).toFixed(2)} hrs{w.overtime > 0 && <span style={{ color: '#ef4444' }}> ({w.overtime.toFixed(2)} OT)</span>}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Regular hours (from time clock: {pay.calculatedRegular.toFixed(2)})</label>
                      <input type="number" min="0" step="0.01" value={adjustments.regularOverride !== null ? adjustments.regularOverride : round2(pay.calculatedRegular)} onChange={(e) => setAdj({ regularOverride: e.target.value })} style={{ ...inputStyle, fontWeight: '600' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Overtime hours (from time clock: {pay.calculatedOvertime.toFixed(2)})</label>
                      <input type="number" min="0" step="0.01" value={adjustments.overtimeOverride !== null ? adjustments.overtimeOverride : round2(pay.calculatedOvertime)} onChange={(e) => setAdj({ overtimeOverride: e.target.value })} style={{ ...inputStyle, fontWeight: '600' }} />
                    </div>
                  </div>
                  {pay.hoursOverridden && <div style={{ fontSize: '11px', color: '#f97316', marginTop: '6px' }}>Hours edited by hand for this paycheck. Reset puts back the time clock numbers.</div>}
                  {!pay.payTypes.includes('hourly') && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>Not paid hourly, so hours don't change this paycheck.</div>}
                </div>

                {/* Commissions */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>💰 Commissions ({pay.commissions.length})</div>
                  {pay.commissions.length === 0 ? (
                    <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No commissions entered this period</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {pay.commissions.map(comm => (
                        <div key={comm.id} style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>Vehicle Sale</div>
                            <div style={{ color: theme.textMuted, fontSize: '11px' }}>{formatDateFull(comm.created_at)}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: Number(comm.amount) < 0 ? '#ef4444' : '#8b5cf6' }}>{formatCurrency(comm.amount)}</div>
                            <button onClick={() => deleteCommission(comm)} title="Permanently delete this commission" style={{ padding: '4px 8px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ))}
                      <div style={{ padding: '12px', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: '#8b5cf6' }}>Total Commissions</span>
                        <span style={{ fontSize: '18px', fontWeight: '700', color: pay.commissionAmount < 0 ? '#ef4444' : '#8b5cf6' }}>{formatCurrency(pay.commissionAmount)}</span>
                      </div>
                      {pay.commissionAmount < 0 && <div style={{ fontSize: '12px', color: '#ef4444' }}>Commissions are negative this period (a car sold for less than it cost). This lowers their pay. Check with your accountant before taking it out of wages.</div>}
                    </div>
                  )}
                </div>

                {/* Bonus & Reimbursement */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px', textTransform: 'uppercase' }}>💵 Additional Pay</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Bonus (taxed)</label>
                      <input type="number" min="0" step="0.01" value={adjustments.bonus || ''} onChange={(e) => setAdj({ bonus: e.target.value })} placeholder="0.00" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: theme.textSecondary, marginBottom: '6px' }}>Reimbursement (not taxed, e.g. gas or parts they paid for)</label>
                      <input type="number" min="0" step="0.01" value={adjustments.reimbursement || ''} onChange={(e) => setAdj({ reimbursement: e.target.value })} placeholder="0.00" style={inputStyle} />
                    </div>
                  </div>
                </div>

                {/* Pay Breakdown */}
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '12px' }}>PAY BREAKDOWN</div>
                  <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.textSecondary }}>Base Pay ({pay.regularHours.toFixed(2)} reg{pay.overtimeHours > 0 ? ` + ${pay.overtimeHours.toFixed(2)} OT` : ''} hrs{pay.payTypes.includes('salary') ? ' + salary' : ''})</span>
                      <span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(pay.basePay)}</span>
                    </div>
                    {pay.commissionAmount !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: theme.textSecondary }}>Commissions</span>
                        <span style={{ color: pay.commissionAmount < 0 ? '#ef4444' : '#8b5cf6', fontWeight: '600' }}>{formatCurrency(pay.commissionAmount)}</span>
                      </div>
                    )}
                    {pay.bonus > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: theme.textSecondary }}>Bonus</span>
                        <span style={{ color: '#22c55e', fontWeight: '600' }}>{formatCurrency(pay.bonus)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '8px', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.text, fontWeight: '600' }}>Gross Pay</span>
                      <span style={{ color: pay.grossPay < 0 ? '#ef4444' : '#22c55e', fontWeight: '700', fontSize: '16px' }}>{formatCurrency(pay.grossPay)}</span>
                    </div>
                    {pay.reimbursement > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                        <span style={{ color: theme.textSecondary }}>Reimbursement</span>
                        <span style={{ color: '#3b82f6', fontWeight: '600' }}>{formatCurrency(pay.reimbursement)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '8px', marginTop: '4px' }}>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>ESTIMATED WITHHOLDING — confirm with your accountant/payroll provider</div>
                      {pay.is1099 ? (
                        <div style={{ padding: '12px', backgroundColor: 'rgba(249,115,22,0.1)', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.2)' }}>
                          <div style={{ fontSize: '13px', color: '#f97316', fontWeight: '600', marginBottom: '4px' }}>No Tax Withholding</div>
                          <div style={{ fontSize: '12px', color: theme.textMuted }}>1099 contractors are responsible for their own taxes</div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: '4px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Federal Tax (est. flat 12%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(pay.federalTax)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>State Tax (est. flat 4.95%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(pay.stateTax)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Social Security (6.2%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(pay.socialSecurity)}</span></div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textSecondary }}>Medicare (1.45%)</span><span style={{ color: '#ef4444' }}>-{formatCurrency(pay.medicare)}</span></div>
                        </div>
                      )}
                    </div>
                    <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '12px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>Est. Net Pay</span>
                      <span style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{formatCurrency(pay.netPay)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <button onClick={() => setPayAdjustments({ ...payAdjustments, [empId]: { ...EMPTY_ADJ } })} style={{ padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
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
