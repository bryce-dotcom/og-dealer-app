import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function Dashboard() {
  const navigate = useNavigate();
  const { dealerId, dealer, inventory, employees, bhphLoans, deals, loading, fetchAllData } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  useEffect(() => {
    if (!dealerId) {
      navigate('/login');
      return;
    }
    fetchAllData();
  }, [dealerId]);

  if (!dealerId) return null;

  const forSale = inventory.filter(v => v.status === 'For Sale' || v.status === 'In Stock');
  const activeTeam = employees.filter(e => e.active);
  const activeLoans = bhphLoans.filter(l => l.status === 'Active');

  const fleetValue = forSale.reduce((sum, v) => sum + (v.sale_price || v.purchase_price || 0), 0);
  const bhphBalance = activeLoans.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const monthlyIncome = activeLoans.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '20px'
  };

  const statCardStyle = {
    ...cardStyle,
    textAlign: 'center',
    padding: '16px'
  };

  const getStatusColor = (status) => {
    if (status === 'Sold') return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' };
    if (status === 'BHPH') return { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
    if (status === 'For Sale' || status === 'In Stock') return { bg: theme.accentBg, color: theme.accent };
    return { bg: 'rgba(113,113,122,0.15)', color: '#71717a' };
  };

  const roleColors = {
    'CEO': '#f97316', 'President': '#22c55e', 'VP Operations': '#3b82f6',
    'Buyer': '#a855f7', 'Sales': '#eab308', 'Finance': '#ec4899'
  };

  const getRoleColor = (roles) => {
    if (!roles || roles.length === 0) return '#71717a';
    for (const role of roles) {
      if (roleColors[role]) return roleColors[role];
    }
    return '#71717a';
  };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>Dashboard</h1>
        <div style={{ fontSize: '14px', color: theme.textMuted }}>{dealer?.dealer_name}</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted }}>Loading...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fleet Value</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: theme.text }}>${fleetValue.toLocaleString()}</div>
              <div style={{ fontSize: '14px', color: theme.textSecondary, marginTop: '4px' }}>{forSale.length} units available</div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BHPH Portfolio</div>
              <div style={{ fontSize: '32px', fontWeight: '700', color: theme.text }}>${bhphBalance.toLocaleString()}</div>
              <div style={{ fontSize: '14px', color: theme.textSecondary, marginTop: '4px' }}>${monthlyIncome.toFixed(2)}/mo income • {activeLoans.length} active</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>{inventory.length}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>Total Units</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{forSale.length}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>For Sale</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>{activeTeam.length}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>Team</div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>{deals.length}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>Deals</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>Recent Inventory</h2>
                <Link to="/inventory" style={{ fontSize: '13px', color: theme.accent, textDecoration: 'none' }}>View All →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {inventory.slice(0, 5).map(vehicle => {
                  const statusStyle = getStatusColor(vehicle.status);
                  return (
                    <div key={vehicle.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="1.5"><path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"/><path d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10h10zm0 0h8v-4a1 1 0 00-1-1h-1.5l-2-4H13v9z"/></svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{vehicle.year} {vehicle.make} {vehicle.model}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>{vehicle.stock_number || 'N/A'} • {(vehicle.miles || vehicle.mileage || 0).toLocaleString()} mi</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: theme.accent, fontSize: '14px' }}>${(vehicle.sale_price || vehicle.purchase_price || 0).toLocaleString()}</div>
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: statusStyle.bg, color: statusStyle.color }}>{vehicle.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Team</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeTeam.map(emp => (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: getRoleColor(emp.roles), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '600', fontSize: '14px' }}>
                      {emp.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{emp.name}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{emp.roles?.join(', ') || 'Staff'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Active Loans</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeLoans.length === 0 ? (
                  <div style={{ color: theme.textMuted, fontSize: '14px' }}>No active BHPH loans</div>
                ) : (
                  activeLoans.map(loan => (
                    <div key={loan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{loan.customer_name || 'Unknown'}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>{loan.visible_id}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '600', color: theme.accent, fontSize: '14px' }}>${(loan.monthly_payment || 0).toFixed(2)}/mo</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>Bal: ${(loan.current_balance || 0).toLocaleString()}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}