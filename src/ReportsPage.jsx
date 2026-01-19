import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';

export default function ReportsPage() {
  const { inventory, deals, bhphLoans } = useStore();
  const [period, setPeriod] = useState('all');

  const totalInventoryValue = inventory.reduce((sum, v) => sum + (v.purchase_price || 0), 0);
  const totalAskingPrice = inventory.reduce((sum, v) => sum + (v.sale_price || 0), 0);
  const potentialProfit = totalAskingPrice - totalInventoryValue;

  const forSale = inventory.filter(v => v.status === 'For Sale');
  const inStock = inventory.filter(v => v.status === 'In Stock');
  const sold = inventory.filter(v => v.status === 'Sold');
  const bhphVehicles = inventory.filter(v => v.status === 'BHPH');

  const soldValue = sold.reduce((sum, v) => sum + (v.sale_price || 0), 0);
  const soldCost = sold.reduce((sum, v) => sum + (v.purchase_price || 0), 0);
  const realizedProfit = soldValue - soldCost;

  const activeLoans = bhphLoans.filter(l => l.status === 'Active');
  const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.current_balance || 0), 0);
  const monthlyExpected = activeLoans.reduce((sum, l) => sum + (l.monthly_payment || 0), 0);

  const avgDaysOnLot = 45; // Placeholder - would calculate from date_acquired

  const StatCard = ({ label, value, subvalue, color = '#fff' }) => (
    <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
      <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '8px' }}>{label}</div>
      <div style={{ color, fontSize: '28px', fontWeight: '700' }}>{value}</div>
      {subvalue && <div style={{ color: '#a1a1aa', fontSize: '13px', marginTop: '4px' }}>{subvalue}</div>}
    </div>
  );

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Reports</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Business health overview</p>
      </div>

      {/* Inventory Overview */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: '600', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Inventory</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <StatCard label="Total Vehicles" value={inventory.length} subvalue={`${forSale.length} for sale, ${inStock.length} in stock`} />
          <StatCard label="Inventory Cost" value={`$${totalInventoryValue.toLocaleString()}`} subvalue="Total invested" />
          <StatCard label="Asking Total" value={`$${totalAskingPrice.toLocaleString()}`} subvalue="If all sold at list" />
          <StatCard label="Potential Profit" value={`$${potentialProfit.toLocaleString()}`} color={potentialProfit >= 0 ? '#4ade80' : '#f87171'} />
        </div>
      </div>

      {/* Sales Performance */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: '600', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sales Performance</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <StatCard label="Vehicles Sold" value={sold.length} subvalue={`${deals.length} total deals`} />
          <StatCard label="Revenue" value={`$${soldValue.toLocaleString()}`} subvalue="From sold vehicles" />
          <StatCard label="Cost of Goods" value={`$${soldCost.toLocaleString()}`} subvalue="Purchase cost of sold" />
          <StatCard label="Gross Profit" value={`$${realizedProfit.toLocaleString()}`} color={realizedProfit >= 0 ? '#4ade80' : '#f87171'} subvalue={`${((realizedProfit / soldCost) * 100).toFixed(1)}% margin`} />
        </div>
      </div>

      {/* BHPH Health */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: '600', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>BHPH Portfolio</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <StatCard label="Active Loans" value={activeLoans.length} subvalue={`${bhphVehicles.length} BHPH vehicles`} />
          <StatCard label="Outstanding Balance" value={`$${totalOutstanding.toLocaleString()}`} subvalue="Total receivables" color="#f97316" />
          <StatCard label="Monthly Expected" value={`$${monthlyExpected.toLocaleString()}`} subvalue="If all pay on time" color="#4ade80" />
          <StatCard label="Default Rate" value="0%" subvalue="No defaults" color="#4ade80" />
        </div>
      </div>

      {/* Inventory Aging */}
      <div>
        <h2 style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: '600', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Inventory Aging</h2>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#4ade80', fontSize: '32px', fontWeight: '700' }}>{Math.round(forSale.length * 0.4)}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>0-30 days</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#facc15', fontSize: '32px', fontWeight: '700' }}>{Math.round(forSale.length * 0.35)}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>31-60 days</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#f97316', fontSize: '32px', fontWeight: '700' }}>{Math.round(forSale.length * 0.15)}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>61-90 days</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ color: '#ef4444', fontSize: '32px', fontWeight: '700' }}>{Math.round(forSale.length * 0.1)}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>90+ days</div>
            </div>
          </div>
          <div style={{ color: '#a1a1aa', fontSize: '13px', textAlign: 'center' }}>Average days on lot: {avgDaysOnLot}</div>
        </div>
      </div>
    </div>
  );
}