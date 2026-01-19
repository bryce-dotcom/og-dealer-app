import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function PayrollPage() {
  const { dealerId, employees } = useStore();
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [unpaidHours, setUnpaidHours] = useState({});
  const [unpaidCommissions, setUnpaidCommissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [payPeriod, setPayPeriod] = useState({
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (dealerId) fetchPayrollData();
  }, [dealerId]);

  async function fetchPayrollData() {
    setLoading(true);

    // Fetch payroll history
    const { data: runs } = await supabase
      .from('payroll')
      .select('*, employees(name)')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (runs) setPayrollRuns(runs);

    // Fetch unpaid time clock hours per employee
    const { data: timeData } = await supabase
      .from('time_clock')
      .select('employee_id, total_hours')
      .eq('dealer_id', dealerId)
      .eq('paid', false)
      .not('clock_out', 'is', null);

    if (timeData) {
      const hours = {};
      timeData.forEach(t => {
        hours[t.employee_id] = (hours[t.employee_id] || 0) + (t.total_hours || 0);
      });
      setUnpaidHours(hours);
    }

    // Fetch unpaid commissions per employee (status = 'pending' or 'approved')
    const { data: commData } = await supabase
      .from('commissions')
      .select('employee_id, amount')
      .eq('dealer_id', dealerId)
      .in('status', ['pending', 'approved']);

    if (commData) {
      const comms = {};
      commData.forEach(c => {
        comms[c.employee_id] = (comms[c.employee_id] || 0) + (c.amount || 0);
      });
      setUnpaidCommissions(comms);
    }

    setLoading(false);
  }

  async function runPayroll(employee) {
    setProcessing(true);
    const hours = unpaidHours[employee.id] || 0;
    const rate = employee.hourly_rate || 0;
    const hourlyPay = hours * rate;
    const commissions = unpaidCommissions[employee.id] || 0;
    const totalPay = hourlyPay + commissions;

    // Create payroll record
    const { data: payrollRecord, error } = await supabase
      .from('payroll')
      .insert({
        employee_id: employee.id,
        pay_period_start: payPeriod.start,
        pay_period_end: payPeriod.end,
        total_hours: hours,
        hourly_rate: rate,
        hourly_pay: hourlyPay,
        total_commissions: commissions,
        total_pay: totalPay,
        status: 'completed',
        payment_date: new Date().toISOString().split('T')[0],
        dealer_id: dealerId
      })
      .select()
      .single();

    if (!error && payrollRecord) {
      // Mark time entries as paid
      await supabase
        .from('time_clock')
        .update({ paid: true, payroll_id: payrollRecord.id })
        .eq('employee_id', employee.id)
        .eq('dealer_id', dealerId)
        .eq('paid', false);

      // Mark commissions as paid
      await supabase
        .from('commissions')
        .update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
        .eq('employee_id', employee.id)
        .eq('dealer_id', dealerId)
        .in('status', ['pending', 'approved']);

      fetchPayrollData();
      setShowRunModal(false);
      setSelectedEmployee(null);
    }
    setProcessing(false);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
  }

  function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const activeEmployees = employees.filter(e => e.active);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Payroll</h1>
          <p className="text-zinc-400">Run payroll and view history</p>
        </div>
      </div>

      {/* Employee Payroll Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {activeEmployees.map(emp => {
          const hours = unpaidHours[emp.id] || 0;
          const hourlyPay = hours * (emp.hourly_rate || 0);
          const commissions = unpaidCommissions[emp.id] || 0;
          const totalDue = hourlyPay + commissions;

          return (
            <div key={emp.id} className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-white">{emp.name}</h3>
                  <p className="text-sm text-zinc-400">{emp.job_title || 'Staff'}</p>
                  <p className="text-xs text-zinc-500">{formatCurrency(emp.hourly_rate || 0)}/hr</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Hours:</span>
                  <span className="text-white">{hours.toFixed(2)} hrs</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Hourly Pay:</span>
                  <span className="text-white">{formatCurrency(hourlyPay)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Commissions:</span>
                  <span className="text-white">{formatCurrency(commissions)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-2 border-t border-zinc-700">
                  <span className="text-zinc-300">Total Due:</span>
                  <span className="text-orange-400">{formatCurrency(totalDue)}</span>
                </div>
              </div>

              <button
                onClick={() => { setSelectedEmployee(emp); setShowRunModal(true); }}
                disabled={totalDue === 0}
                className={`w-full py-2 rounded-lg font-medium transition-colors ${
                  totalDue > 0
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {totalDue > 0 ? 'Run Payroll' : 'Nothing Due'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payroll History */}
      <div className="bg-zinc-800/50 rounded-lg border border-zinc-700">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-white">Payroll History</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading...</div>
        ) : payrollRuns.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">No payroll runs yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider">
                  <th className="p-4">Employee</th>
                  <th className="p-4">Pay Period</th>
                  <th className="p-4">Hours</th>
                  <th className="p-4">Hourly</th>
                  <th className="p-4">Commissions</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Paid On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {payrollRuns.map(run => (
                  <tr key={run.id} className="hover:bg-zinc-700/30">
                    <td className="p-4 text-white font-medium">{run.employees?.name || 'Unknown'}</td>
                    <td className="p-4 text-zinc-300 text-sm">
                      {formatDate(run.pay_period_start)} - {formatDate(run.pay_period_end)}
                    </td>
                    <td className="p-4 text-zinc-300">{(run.total_hours || 0).toFixed(2)}</td>
                    <td className="p-4 text-zinc-300">{formatCurrency(run.hourly_pay)}</td>
                    <td className="p-4 text-zinc-300">{formatCurrency(run.total_commissions)}</td>
                    <td className="p-4 text-green-400 font-semibold">{formatCurrency(run.total_pay)}</td>
                    <td className="p-4 text-zinc-300">{formatDate(run.payment_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Run Payroll Modal */}
      {showRunModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Run Payroll</h3>
            <p className="text-zinc-400 mb-4">Confirm payroll for <span className="text-white font-semibold">{selectedEmployee.name}</span></p>

            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Pay Period Start</label>
                <input
                  type="date"
                  value={payPeriod.start}
                  onChange={e => setPayPeriod({ ...payPeriod, start: e.target.value })}
                  className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Pay Period End</label>
                <input
                  type="date"
                  value={payPeriod.end}
                  onChange={e => setPayPeriod({ ...payPeriod, end: e.target.value })}
                  className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded text-white"
                />
              </div>
            </div>

            <div className="bg-zinc-900 rounded p-4 mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-zinc-400">Hours ({(unpaidHours[selectedEmployee.id] || 0).toFixed(2)} × {formatCurrency(selectedEmployee.hourly_rate || 0)})</span>
                <span className="text-white">{formatCurrency((unpaidHours[selectedEmployee.id] || 0) * (selectedEmployee.hourly_rate || 0))}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-zinc-400">Commissions</span>
                <span className="text-white">{formatCurrency(unpaidCommissions[selectedEmployee.id] || 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-zinc-700 font-bold">
                <span className="text-white">Total</span>
                <span className="text-green-400">
                  {formatCurrency(
                    (unpaidHours[selectedEmployee.id] || 0) * (selectedEmployee.hourly_rate || 0) +
                    (unpaidCommissions[selectedEmployee.id] || 0)
                  )}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowRunModal(false); setSelectedEmployee(null); }}
                className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => runPayroll(selectedEmployee)}
                disabled={processing}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Confirm & Pay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}