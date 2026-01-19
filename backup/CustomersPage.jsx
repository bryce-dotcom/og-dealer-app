import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function CustomersPage() {
  const { dealerId } = useStore();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });

  useEffect(() => { loadCustomers(); }, [dealerId]);

  const loadCustomers = async () => {
    if (!dealerId) return;
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  };

  const addCustomer = async () => {
    if (!newCustomer.name) { alert('Name is required'); return; }
    const { error } = await supabase.from('customers').insert({ ...newCustomer, dealer_id: dealerId });
    if (error) { alert('Error: ' + error.message); }
    else { setShowAdd(false); setNewCustomer({ name: '', phone: '', email: '', address: '' }); loadCustomers(); }
  };

  const filtered = customers.filter(c => 
    search === '' || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#09090b', color: '#fff', fontSize: '14px', outline: 'none' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', color: '#a1a1aa', fontWeight: '500' };

  if (loading) return <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh', color: '#71717a' }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Customers</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{customers.length} total</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ Add Customer</button>
      </div>

      <input type="text" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #27272a', backgroundColor: '#18181b', color: '#fff', fontSize: '14px', width: '100%', maxWidth: '400px', marginBottom: '20px', outline: 'none' }} />

      <div style={{ backgroundColor: '#18181b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#27272a' }}>
              {['Name', 'Phone', 'Email', 'Address'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: '#a1a1aa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id || i} style={{ borderBottom: '1px solid #27272a' }}>
                <td style={{ padding: '14px 16px', color: '#fff', fontWeight: '500' }}>{c.name}</td>
                <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{c.phone || '-'}</td>
                <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{c.email || '-'}</td>
                <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{c.address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#71717a' }}>No customers found</div>}
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Add Customer</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div><label style={labelStyle}>Name *</label><input type="text" value={newCustomer.name} onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Phone</label><input type="tel" value={newCustomer.phone} onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Email</label><input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Address</label><input type="text" value={newCustomer.address} onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={addCustomer} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}