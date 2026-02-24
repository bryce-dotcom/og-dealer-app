import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function CommissionsPage() {
  const { dealerId, employees, currentEmployee } = useStore();
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);

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
    const { data, error } = await supabase
      .from('inventory_commissions')
      .select('*, employees(name)')
      .eq('dealer_id', dealerId);

    if (error) {
      console.error('Error fetching commissions:', error);
    } else {
      setCommissions(data || []);
    }
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
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Track sales commissions across your team</p>
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
              <div key={emp.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#27272a', borderRadius: '8px' }}>
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
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#22c55e', fontWeight: '600', fontSize: '18px' }}>
                    {formatCurrency(emp.commissionTotal)}
                  </div>
                  <div style={{ color: '#71717a', fontSize: '12px' }}>
                    {emp.commissionCount} {emp.commissionCount === 1 ? 'deal' : 'deals'}
                  </div>
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
    </div>
  );
}