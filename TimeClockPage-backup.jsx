import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function TimeClockPage() {
  const { dealerId, employees } = useStore();
  const [timeEntries, setTimeEntries] = useState([]);
  const [activeClocks, setActiveClocks] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dealerId) fetchTimeEntries();
  }, [dealerId]);

  async function fetchTimeEntries() {
    setLoading(true);
    const { data, error } = await supabase
      .from('time_clock')
      .select('*, employees(name)')
      .eq('dealer_id', dealerId)
      .order('clock_in', { ascending: false })
      .limit(100);

    if (!error && data) {
      setTimeEntries(data);
      const active = {};
      data.forEach(entry => {
        if (!entry.clock_out) active[entry.employee_id] = entry;
      });
      setActiveClocks(active);
    }
    setLoading(false);
  }

  async function clockIn(employeeId) {
    const { error } = await supabase.from('time_clock').insert({
      employee_id: employeeId,
      clock_in: new Date().toISOString(),
      dealer_id: dealerId
    });
    if (!error) fetchTimeEntries();
  }

  async function clockOut(entryId, clockInTime) {
    const clockOut = new Date();
    const clockIn = new Date(clockInTime);
    const totalHours = (clockOut - clockIn) / (1000 * 60 * 60);
    
    const { error } = await supabase
      .from('time_clock')
      .update({ 
        clock_out: clockOut.toISOString(),
        total_hours: Math.round(totalHours * 100) / 100
      })
      .eq('id', entryId);
    if (!error) fetchTimeEntries();
  }

  function formatTime(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  function formatHours(hours) {
    if (!hours) return '-';
    return hours.toFixed(2) + ' hrs';
  }

  const activeEmployees = employees.filter(e => e.active);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Time Clock</h1>
          <p className="text-zinc-400">Track employee hours</p>
        </div>
      </div>

      {/* Clock In/Out Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {activeEmployees.map(emp => {
          const isActive = activeClocks[emp.id];
          return (
            <div key={emp.id} className={`p-4 rounded-lg border ${isActive ? 'bg-green-900/20 border-green-500/50' : 'bg-zinc-800/50 border-zinc-700'}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-white">{emp.name}</h3>
                  <p className="text-sm text-zinc-400">{emp.job_title || emp.roles?.join(', ') || 'Staff'}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
              </div>
              
              {isActive ? (
                <div>
                  <p className="text-xs text-zinc-400 mb-2">Clocked in: {formatTime(isActive.clock_in)}</p>
                  <button
                    onClick={() => clockOut(isActive.id, isActive.clock_in)}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Clock Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => clockIn(emp.id)}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  Clock In
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Time Entries */}
      <div className="bg-zinc-800/50 rounded-lg border border-zinc-700">
        <div className="p-4 border-b border-zinc-700">
          <h2 className="text-lg font-semibold text-white">Recent Time Entries</h2>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-zinc-400">Loading...</div>
        ) : timeEntries.length === 0 ? (
          <div className="p-8 text-center text-zinc-400">No time entries yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider">
                  <th className="p-4">Employee</th>
                  <th className="p-4">Clock In</th>
                  <th className="p-4">Clock Out</th>
                  <th className="p-4">Hours</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {timeEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-zinc-700/30">
                    <td className="p-4 text-white font-medium">{entry.employees?.name || 'Unknown'}</td>
                    <td className="p-4 text-zinc-300">{formatTime(entry.clock_in)}</td>
                    <td className="p-4 text-zinc-300">{formatTime(entry.clock_out)}</td>
                    <td className="p-4 text-zinc-300">{formatHours(entry.total_hours)}</td>
                    <td className="p-4">
                      {!entry.clock_out ? (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">Active</span>
                      ) : entry.paid ? (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">Paid</span>
                      ) : (
                        <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">Unpaid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}