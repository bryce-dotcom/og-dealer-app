import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function CommissionsPage() {
  const { dealerId, employees, currentEmployee } = useStore();
  const [commissions, setCommissions] = useState([]);
  const [inventoryMap, setInventoryMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [drilldown, setDrilldown] = useState(null); // { employee, rows }

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

    if (commRes.error) console.error('Error fetching commissions:', commRes.error);
    setCommissions(commRes.data || []);

    const map = {};
    (invRes.data || []).forEach(v => { map[v.id] = v; });
    setInventoryMap(map);

    setLoading(false);
  }

  // Calculate totals by employee
  const employeeCommissions = {};
  commissions.forEach(comm => {
    const empId = comm.employee_id;
    if (!empId) return;

    if (!employeeCommissions[empId]) {
      employeeCommissions[empId] = {
        total: 0,
        count: 0,
        name: comm.employees?.name || 'Unknown'
      };
    }

    employeeCommissions[empId].total += parseFloat(comm.amount) || 0;
    employeeCommissions[empId].count++;
  });

  // Sort employees by commission total (highest first)
  const sortedEmployees = employees
    .filter(e => e.active)
    .map(emp => ({
      ...emp,
      commissionTotal: employeeCommissions[emp.id]?.total || 0,
      commissionCount: employeeCommissions[emp.id]?.count || 0
    }))
    .sort((a, b) => b.commissionTotal - a.commissionTotal);

  const totalCommissions = Object.values(employeeCommissions).reduce((sum, e) => sum + e.total, 0);
  const totalDeals = Object.values(employeeCommissions).reduce((sum, e) => sum + e.count, 0);

  const formatCurrency = (amount) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount || 0);

  const formatDate = (iso) => {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleDateString(); } catch { return '-'; }
  };

  const openDrilldown = (emp) => {
    const rows = commissions
      .filter(c => c.employee_id === emp.id)
      .map(c => ({
        ...c,
        vehicle: inventoryMap[c.inventory_id] || null
      }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setDrilldown({ employee: emp, rows });
  };

  const cardStyle = { backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' };

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
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Commissions</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Click a team member to see per-vehicle commission detail</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Commissions</div>
          <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: '700' }}>{formatCurrency(totalCommissions)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Commission Deals</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{totalDeals}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Sales Team</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{sortedEmployees.length}</div>
        </div>
      </div>

      {/* Team List */}
      <div style={cardStyle}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Team Performance</h2>

        {sortedEmployees.length === 0 ? (
          <p style={{ color: '#71717a' }}>No team members</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortedEmployees.map((emp, i) => (
              <div
                key={emp.id || i}
                onClick={() => emp.commissionCount > 0 && openDrilldown(emp)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '16px', backgroundColor: '#27272a', borderRadius: '8px',
                  cursor: emp.commissionCount > 0 ? 'pointer' : 'default',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={e => { if (emp.commissionCount > 0) e.currentTarget.style.backgroundColor = '#3f3f46'; }}
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
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : emp.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: '500' }}>{emp.name}</div>
                    <div style={{ color: '#71717a', fontSize: '13px' }}>{emp.roles?.join(', ') || 'Staff'}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <div style={{ color: '#22c55e', fontWeight: '600', fontSize: '18px' }}>
                      {formatCurrency(emp.commissionTotal)}
                    </div>
                    <div style={{ color: '#71717a', fontSize: '12px' }}>
                      {emp.commissionCount} {emp.commissionCount === 1 ? 'deal' : 'deals'}
                    </div>
                  </div>
                  {emp.commissionCount > 0 && (
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
            No commission data yet. Commissions are automatically tracked when vehicles are sold through the inventory page.
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
                <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: 0 }}>{drilldown.employee.name}</h2>
                <div style={{ color: '#71717a', fontSize: '13px', marginTop: '2px' }}>
                  {drilldown.employee.roles?.join(', ') || 'Staff'} · {drilldown.rows.length} {drilldown.rows.length === 1 ? 'commission' : 'commissions'}
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
                <div style={{ color: '#22c55e', fontSize: '22px', fontWeight: '700' }}>{formatCurrency(drilldown.employee.commissionTotal)}</div>
              </div>
              <div style={{ backgroundColor: '#27272a', borderRadius: '8px', padding: '12px' }}>
                <div style={{ color: '#71717a', fontSize: '12px' }}>Avg / Deal</div>
                <div style={{ color: '#fff', fontSize: '22px', fontWeight: '700' }}>
                  {formatCurrency(drilldown.rows.length ? drilldown.employee.commissionTotal / drilldown.rows.length : 0)}
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
                        <td style={{ padding: '8px', borderBottom: '1px solid #27272a', textAlign: 'right', color: '#22c55e', fontWeight: '600' }}>
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
