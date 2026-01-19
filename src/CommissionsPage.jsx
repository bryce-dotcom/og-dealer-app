import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function CommissionsPage() {
  const { dealerId, deals, employees, inventory } = useStore();
  const [commissions, setCommissions] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadData(); }, [dealerId]);

  const loadData = async () => {
    if (!dealerId) return;
    setLoading(true);
    const [commRes, defRes] = await Promise.all([
      supabase.from('commissions').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('commission_defaults').select('*').eq('dealer_id', dealerId)
    ]);
    setCommissions(commRes.data || []);
    setDefaults(defRes.data || []);
    setLoading(false);
  };

  const markPaid = async (id) => {
    await supabase.from('commissions').update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    loadData();
  };

  const totalPending = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalPaid = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + (c.amount || 0), 0);

  const filtered = filter === 'all' ? commissions : commissions.filter(c => c.status === filter);

  const getDeal = (dealId) => deals.find(d => d.id == dealId);
  const getVehicle = (deal) => deal ? inventory.find(v => v.id == deal.vehicle_id) : null;

  if (loading) return <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh', color: '#71717a' }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Commissions</h1>
        <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>Track sales compensation</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Pending</div>
          <div style={{ color: '#f97316', fontSize: '28px', fontWeight: '700' }}>${totalPending.toLocaleString()}</div>
        </div>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Paid This Month</div>
          <div style={{ color: '#4ade80', fontSize: '28px', fontWeight: '700' }}>${totalPaid.toLocaleString()}</div>
        </div>
        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', padding: '20px', border: '1px solid #27272a' }}>
          <div style={{ color: '#71717a', fontSize: '13px', marginBottom: '4px' }}>Commission Rate</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: '700' }}>{defaults[0]?.percentage || 25}%</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['all', 'pending', 'paid'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: filter === f ? '#f97316' : '#27272a', color: filter === f ? '#fff' : '#a1a1aa', fontSize: '13px', cursor: 'pointer', fontWeight: '500', textTransform: 'capitalize' }}>{f}</button>
        ))}
      </div>

      <div style={{ backgroundColor: '#18181b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#27272a' }}>
              {['Employee', 'Role', 'Deal', 'Amount', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: '#a1a1aa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const deal = getDeal(c.deal_id);
              const vehicle = getVehicle(deal);
              return (
                <tr key={c.id || i} style={{ borderBottom: '1px solid #27272a' }}>
                  <td style={{ padding: '14px 16px', color: '#fff', fontWeight: '500' }}>{c.employee_name}</td>
                  <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{c.role}</td>
                  <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : deal?.purchaser_name || 'N/A'}</td>
                  <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '600' }}>${(c.amount || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '12px', backgroundColor: c.status === 'paid' ? '#166534' : '#78350f', color: c.status === 'paid' ? '#4ade80' : '#fbbf24', fontSize: '12px', fontWeight: '500' }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {c.status === 'pending' && (
                      <button onClick={() => markPaid(c.id)} style={{ padding: '6px 12px', backgroundColor: '#166534', color: '#4ade80', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Mark Paid</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#71717a' }}>No commissions found</div>}
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: '600', marginBottom: '16px', textTransform: 'uppercase' }}>Default Rates</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
          {defaults.map((d, i) => (
            <div key={i} style={{ backgroundColor: '#18181b', borderRadius: '8px', padding: '16px', border: '1px solid #27272a' }}>
              <div style={{ color: '#fff', fontWeight: '600', marginBottom: '4px' }}>{d.role}</div>
              <div style={{ color: '#f97316', fontSize: '20px', fontWeight: '700' }}>{d.percentage}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}