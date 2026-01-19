import { useStore } from '../lib/store';

export default function ReportsPage() {
  const { inventory, deals, bhphLoans, employees } = useStore();

  const forSale = inventory.filter(v => v.status === 'For Sale' || v.status === 'In Stock');
  const sold = inventory.filter(v => v.status === 'Sold');
  const activeLoans = bhphLoans.filter(l => l.status === 'Active');

  const totalInventoryValue = forSale.reduce((sum, v) => sum + (v.sale_price || v.purchase_price || 0), 0);
  const totalSold = sold.reduce((sum, v) => sum + (v.sale_price || 0), 0);
  const totalProfit = sold.reduce((sum, v) => sum + ((v.sale_price || 0) - (v.purchase_price || 0)), 0);
  const bhphOutstanding = activeLoans.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const bhphMonthly = activeLoans.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

  const cardStyle = { backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Reports</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Business overview</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Inventory Value</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>${totalInventoryValue.toLocaleString()}</div>
          <div style={{ color: '#71717a', fontSize: '12px' }}>{forSale.length} units</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Sold</div>
          <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: '700' }}>${totalSold.toLocaleString()}</div>
          <div style={{ color: '#71717a', fontSize: '12px' }}>{sold.length} vehicles</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Profit</div>
          <div style={{ color: totalProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '28px', fontWeight: '700' }}>${totalProfit.toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>BHPH Outstanding</div>
          <div style={{ color: '#f97316', fontSize: '28px', fontWeight: '700' }}>${bhphOutstanding.toLocaleString()}</div>
          <div style={{ color: '#71717a', fontSize: '12px' }}>${bhphMonthly.toLocaleString()}/mo income</div>
        </div>
      </div>

      {/* Inventory Breakdown */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Inventory Breakdown</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {['For Sale', 'In Stock', 'Sold', 'BHPH'].map(status => {
            const count = inventory.filter(v => v.status === status).length;
            const colors = {
              'For Sale': '#22c55e',
              'In Stock': '#3b82f6',
              'Sold': '#a855f7',
              'BHPH': '#f97316'
            };
            return (
              <div key={status} style={{ backgroundColor: '#27272a', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ color: colors[status] || '#fff', fontSize: '24px', fontWeight: '700' }}>{count}</div>
                <div style={{ color: '#a1a1aa', fontSize: '13px' }}>{status}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ ...cardStyle }}>
        <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Quick Stats</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
            <span style={{ color: '#a1a1aa' }}>Total Inventory</span>
            <span style={{ color: '#fff', fontWeight: '600' }}>{inventory.length} vehicles</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
            <span style={{ color: '#a1a1aa' }}>Active BHPH Loans</span>
            <span style={{ color: '#fff', fontWeight: '600' }}>{activeLoans.length} loans</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
            <span style={{ color: '#a1a1aa' }}>Team Members</span>
            <span style={{ color: '#fff', fontWeight: '600' }}>{employees.filter(e => e.active).length} active</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
            <span style={{ color: '#a1a1aa' }}>Total Deals</span>
            <span style={{ color: '#fff', fontWeight: '600' }}>{deals.length} deals</span>
          </div>
        </div>
      </div>
    </div>
  );
}