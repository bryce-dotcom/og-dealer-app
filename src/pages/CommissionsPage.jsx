import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

const PERIODS = [
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'all', label: 'All time' }
];

// [start, end) in local time for the chosen period; null = no limit.
function getPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  if (period === 'last-month') return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
  if (period === 'ytd') return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  return { start: null, end: null };
}

export default function CommissionsPage() {
  const { dealerId, employees, currentEmployee } = useStore();
  const [commissions, setCommissions] = useState([]);
  const [inventoryMap, setInventoryMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState('all');
  const [drilldown, setDrilldown] = useState(null); // { person, rows }

  // Role check - similar to ReportsPage
  const userRoles = currentEmployee?.roles || [];
  const hasNoEmployee = !currentEmployee;
  const isAdmin = hasNoEmployee || userRoles.some(r => ['Owner', 'CEO', 'Admin', 'President', 'VP Operations'].includes(r));
  const isManager = isAdmin || userRoles.some(r => ['Manager', 'Sales Manager', 'General Manager'].includes(r));

  useEffect(() => {
    if (dealerId) fetchCommissions();
  }, [dealerId]);

  async function fetchCommissions() {
    setLoading(true);
    const [commRes, invRes] = await Promise.all([
      supabase
        .from('inventory_commissions')
        .select('*, employees(name)')
        .eq('dealer_id', dealerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('inventory')
        .select('id, year, make, model, trim, vin, stock_number, sale_price, status')
        .eq('dealer_id', dealerId)
    ]);

    if (commRes.error) setLoadError('Could not load commissions: ' + commRes.error.message);
    else if (invRes.error) setLoadError('Could not load vehicles for commission details: ' + invRes.error.message);
    else setLoadError('');
    setCommissions(commRes.data || []);

    const map = {};
    (invRes.data || []).forEach(v => { map[v.id] = v; });
    setInventoryMap(map);

    setLoading(false);
  }

  // Commissions in the chosen period (by the date the commission was entered).
  const { start, end } = getPeriodRange(period);
  const periodCommissions = commissions.filter(c => {
    if (!start) return true;
    const d = new Date(c.created_at);
    return d >= start && d < end;
  });

  // Group by employee_id, or by the typed name when a row has no employee linked,
  // so every entry is counted in exactly one person's total.
  const personKey = (c) => (c.employee_id ? `id:${c.employee_id}` : `name:${(c.employee_name || 'Unknown').trim().toLowerCase()}`);
  const groups = {};
  periodCommissions.forEach(comm => {
    const key = personKey(comm);
    if (!groups[key]) {
      const emp = comm.employee_id ? employees.find(e => e.id === comm.employee_id) : null;
      groups[key] = {
        key,
        id: comm.employee_id || null,
        name: emp?.name || comm.employees?.name || comm.employee_name || 'Unknown',
        roles: emp?.roles || null,
        active: emp ? !!emp.active : false,
        linked: !!comm.employee_id,
        commissionTotal: 0,
        commissionCount: 0
      };
    }
    groups[key].commissionTotal += parseFloat(comm.amount) || 0;
    groups[key].commissionCount++;
  });

  // Everyone with entries (active or not), plus active employees with none yet.
  employees.filter(e => e.active).forEach(emp => {
    const key = `id:${emp.id}`;
    if (!groups[key]) groups[key] = { key, id: emp.id, name: emp.name, roles: emp.roles, active: true, linked: true, commissionTotal: 0, commissionCount: 0 };
  });

  const people = Object.values(groups).sort((a, b) => b.commissionTotal - a.commissionTotal || a.name.localeCompare(b.name));
  const totalCommissions = periodCommissions.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  const totalEntries = periodCommissions.length;

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount || 0);

  const formatDate = (iso) => {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleDateString(); } catch { return '-'; }
  };

  const personLabel = (p) => {
    if (!p.linked) return 'Not linked to a team member';
    const roles = p.roles?.join(', ') || 'Staff';
    return p.active ? roles : `${roles} · inactive`;
  };

  const openDrilldown = (person) => {
    const rows = periodCommissions
      .filter(c => personKey(c) === person.key)
      .map(c => ({
        ...c,
        vehicle: inventoryMap[c.inventory_id] || null
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setDrilldown({ person, rows });
  };

  const cardStyle = { backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' };
  const amountColor = (n) => (n < 0 ? '#ef4444' : '#22c55e');

  // Access control
  if (!isManager && !isAdmin) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Commissions</h1>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <div style={{ color: '#ef4444', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Access Restricted</div>
          <div style={{ color: '#71717a' }}>Only managers and admins can view commission data.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
        <div style={{ color: '#71717a', textAlign: 'center', padding: '40px' }}>Loading commissions...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Commissions</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Commissions entered on vehicles in Inventory. Click a person to see each vehicle.</p>
        </div>
        <div style={{ display: 'flex', gap: '4px', backgroundColor: '#18181b', borderRadius: '8px', border: '1px solid #27272a', overflow: 'hidden' }}>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)} style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              backgroundColor: period === p.id ? '#f97316' : 'transparent',
              color: period === p.id ? '#fff' : '#a1a1aa'
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {loadError && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{loadError}</div>
      )}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '8px' }}>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Commissions</div>
          <div style={{ color: amountColor(totalCommissions), fontSize: '28px', fontWeight: '700' }}>{formatCurrency(totalCommissions)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Commission entries</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{totalEntries}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>People</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{people.length}</div>
        </div>
      </div>
      <p style={{ color: '#71717a', fontSize: '12px', margin: '0 0 24px' }}>
        Dates are when the commission was entered. A negative amount means the car sold for less than it cost.
      </p>

      {/* Team List */}
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Team Performance</h2>

        {people.length === 0 ? (
          <p style={{ color: '#71717a' }}>No team members</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {people.map((p, i) => (
              <div
                key={p.key}
                onClick={() => p.commissionCount > 0 && openDrilldown(p)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px', backgroundColor: '#27272a', borderRadius: '8px',
                  cursor: p.commissionCount > 0 ? 'pointer' : 'default',
                  transition: 'background-color 0.15s',
                  opacity: p.linked && !p.active ? 0.8 : 1
                }}
                onMouseEnter={e => { if (p.commissionCount > 0) e.currentTarget.style.backgroundColor = '#3f3f46'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#27272a'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: i === 0 ? '#fbbf24' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : '#f97316',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: i < 3 ? '#000' : '#fff',
                    fontWeight: '600',
                    fontSize: '18px'
                  }}>
                    {i < 3 && p.commissionTotal > 0 ? ['🥇', '🥈', '🥉'][i] : p.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: '500' }}>{p.name}</div>
                    <div style={{ color: '#71717a', fontSize: '13px' }}>{personLabel(p)}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <div style={{ color: amountColor(p.commissionTotal), fontWeight: '600', fontSize: '18px' }}>
                      {formatCurrency(p.commissionTotal)}
                    </div>
                    <div style={{ color: '#71717a', fontSize: '12px' }}>
                      {p.commissionCount} {p.commissionCount === 1 ? 'entry' : 'entries'}
                    </div>
                  </div>
                  {p.commissionCount > 0 && (
                    <span style={{ color: '#71717a', fontSize: '18px' }}>›</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {commissions.length === 0 && (
        <div style={{ marginTop: '24px', padding: '20px', backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a' }}>
          <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
            No commissions yet. To add one, open a vehicle on the Inventory page and enter the commission there. They are not added automatically when a car sells.
          </p>
        </div>
      )}
      {commissions.length > 0 && periodCommissions.length === 0 && (
        <div style={{ marginTop: '24px', padding: '20px', backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a' }}>
          <p style={{ color: '#71717a', fontSize: '14px', margin: 0 }}>
            No commissions were entered in this period. Try "All time".
          </p>
        </div>
      )}

      {/* Drilldown modal */}
      {drilldown && (
        <div
          onClick={() => setDrilldown(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '900px', maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0 }}>{drilldown.person.name}</h2>
                <div style={{ color: '#71717a', fontSize: '13px', marginTop: '2px' }}>
                  {personLabel(drilldown.person)} · {drilldown.rows.length} {drilldown.rows.length === 1 ? 'entry' : 'entries'} · {PERIODS.find(p => p.id === period)?.label}
                </div>
              </div>
              <button
                onClick={() => setDrilldown(null)}
                style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Total Earned</div>
                <div style={{ color: amountColor(drilldown.person.commissionTotal), fontSize: '22px', fontWeight: '700' }}>{formatCurrency(drilldown.person.commissionTotal)}</div>
              </div>
              <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Avg / Entry</div>
                <div style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>
                  {formatCurrency(drilldown.rows.length ? drilldown.person.commissionTotal / drilldown.rows.length : 0)}
                </div>
              </div>
              <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>As Specialist</div>
                <div style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>
                  {drilldown.rows.filter(r => r.is_specialist).length}
                </div>
              </div>
              <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>As Helper</div>
                <div style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>
                  {drilldown.rows.filter(r => !r.is_specialist).length}
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ color: '#71717a', textAlign: 'left' }}>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500' }}>Date</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500' }}>Vehicle</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500' }}>Stock #</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500' }}>Role</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500' }}>Type</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500', textAlign: 'right' }}>Rate</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500', textAlign: 'right' }}>Sale Price</th>
                    <th style={{ padding: '8px', borderBottom: '1px solid #27272a', fontWeight: '500', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldown.rows.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '20px', color: '#71717a', textAlign: 'center' }}>No commissions yet.</td></tr>
                  ) : drilldown.rows.map(r => {
                    const v = r.vehicle;
                    const vehicleLabel = v
                      ? [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')
                      : (r.inventory_id ? 'Vehicle (removed)' : '-');
                    const rate = r.override_rate ?? r.rate_used;
                    return (
                      <tr key={r.id} style={{ color: '#e4e4e7' }}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a' }}>{formatDate(r.created_at)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a' }}>{vehicleLabel}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a', fontFamily: 'monospace', fontSize: '12px' }}>{v?.stock_number || (v?.vin ? v.vin.slice(-6) : '-')}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a' }}>{r.role || '-'}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a', color: r.is_specialist ? '#a855f7' : '#3b82f6' }}>
                          {r.is_specialist ? 'Specialist' : 'Helper'}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a', textAlign: 'right' }}>
                          {rate != null ? `${(rate * 100).toFixed(1)}%` : (r.commission_type === 'Flat' ? 'Flat' : '-')}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a', textAlign: 'right', color: '#a1a1aa' }}>
                          {v?.sale_price ? formatCurrency(v.sale_price) : '-'}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a', textAlign: 'right', color: amountColor(parseFloat(r.amount) || 0), fontWeight: '600' }}>
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
