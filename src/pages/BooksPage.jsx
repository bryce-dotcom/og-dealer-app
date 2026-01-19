import { useState } from 'react';
import { useStore } from '../lib/store';

export default function BooksPage() {
  const { inventory, deals, bhphLoans } = useStore();
  const [activeTab, setActiveTab] = useState('overview');

  const totalRevenue = deals.reduce((sum, d) => sum + (d.price || 0), 0);
  const totalCost = inventory.filter(v => v.status === 'Sold').reduce((sum, v) => sum + (v.purchase_price || 0), 0);
  const grossProfit = totalRevenue - totalCost;
  const bhphIncome = bhphLoans.filter(l => l.status === 'Active').reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

  const cardStyle = { backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' };
  const tabStyle = (active) => ({
    padding: '10px 20px',
    backgroundColor: active ? '#f97316' : '#27272a',
    color: active ? '#fff' : '#a1a1aa',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px'
  });

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Books</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Financial overview</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button onClick={() => setActiveTab('overview')} style={tabStyle(activeTab === 'overview')}>Overview</button>
        <button onClick={() => setActiveTab('income')} style={tabStyle(activeTab === 'income')}>Income</button>
        <button onClick={() => setActiveTab('expenses')} style={tabStyle(activeTab === 'expenses')}>Expenses</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Revenue</div>
          <div style={{ color: '#22c55e', fontSize: '28px', fontWeight: '700' }}>${totalRevenue.toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Total Cost</div>
          <div style={{ color: '#ef4444', fontSize: '28px', fontWeight: '700' }}>${totalCost.toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Gross Profit</div>
          <div style={{ color: grossProfit >= 0 ? '#22c55e' : '#ef4444', fontSize: '28px', fontWeight: '700' }}>${grossProfit.toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>BHPH Monthly</div>
          <div style={{ color: '#f97316', fontSize: '28px', fontWeight: '700' }}>${bhphIncome.toLocaleString()}</div>
        </div>
      </div>

      {/* Content based on tab */}
      <div style={cardStyle}>
        {activeTab === 'overview' && (
          <div>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Financial Summary</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
                <span style={{ color: '#a1a1aa' }}>Vehicles Sold</span>
                <span style={{ color: '#fff', fontWeight: '600' }}>{deals.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
                <span style={{ color: '#a1a1aa' }}>Active BHPH Loans</span>
                <span style={{ color: '#fff', fontWeight: '600' }}>{bhphLoans.filter(l => l.status === 'Active').length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
                <span style={{ color: '#a1a1aa' }}>Avg Sale Price</span>
                <span style={{ color: '#fff', fontWeight: '600' }}>${deals.length ? Math.round(totalRevenue / deals.length).toLocaleString() : 0}</span>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'income' && (
          <div>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Income</h2>
            <p style={{ color: '#71717a' }}>Income tracking coming soon. Connect Plaid for automatic transaction import.</p>
          </div>
        )}
        {activeTab === 'expenses' && (
          <div>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Expenses</h2>
            <p style={{ color: '#71717a' }}>Expense tracking coming soon. Connect Plaid for automatic transaction import.</p>
          </div>
        )}
      </div>
    </div>
  );
}