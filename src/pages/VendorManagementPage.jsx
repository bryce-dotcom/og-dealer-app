import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function VendorManagementPage() {
  const { theme } = useTheme();
  const { dealer, inventory } = useStore();
  const dealerId = dealer?.id;

  const [activeTab, setActiveTab] = useState('vendors');
  const [vendors, setVendors] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [vendorForm, setVendorForm] = useState({ name: '', company: '', vendor_type: 'general', phone: '', email: '', address: '', city: '', state: '', zip: '', payment_terms: '', tax_id: '', w9_on_file: false });
  const [payForm, setPayForm] = useState({ vendor_id: '', vehicle_id: '', description: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'check', reference_number: '', invoice_number: '', category: '' });

  const vendorTypes = [
    { value: 'mechanic', label: 'Mechanic' }, { value: 'body_shop', label: 'Body Shop' },
    { value: 'detail', label: 'Detail' }, { value: 'parts', label: 'Parts' },
    { value: 'tires', label: 'Tires' }, { value: 'glass', label: 'Glass' },
    { value: 'electrical', label: 'Electrical' }, { value: 'transport', label: 'Transport' },
    { value: 'auction', label: 'Auction' }, { value: 'general', label: 'General' },
  ];

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const [vRes, pRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('dealer_id', dealerId).order('name'),
      supabase.from('vendor_payments').select('*').eq('dealer_id', dealerId).order('payment_date', { ascending: false }),
    ]);
    setVendors(vRes.data || []);
    setPayments(pRes.data || []);
    setLoading(false);
  };

  const formatCurrency = (amt) => amt == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amt);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  const handleSaveVendor = async () => {
    if (!vendorForm.name) return;
    const payload = { dealer_id: dealerId, name: vendorForm.name, company: vendorForm.company || null, vendor_type: vendorForm.vendor_type, phone: vendorForm.phone || null, email: vendorForm.email || null, address: vendorForm.address || null, city: vendorForm.city || null, state: vendorForm.state || null, zip: vendorForm.zip || null, payment_terms: vendorForm.payment_terms || null, tax_id: vendorForm.tax_id || null, w9_on_file: vendorForm.w9_on_file };
    if (editingVendor) {
      await supabase.from('vendors').update(payload).eq('id', editingVendor.id);
    } else {
      await supabase.from('vendors').insert(payload);
    }
    setShowVendorModal(false); setEditingVendor(null);
    setVendorForm({ name: '', company: '', vendor_type: 'general', phone: '', email: '', address: '', city: '', state: '', zip: '', payment_terms: '', tax_id: '', w9_on_file: false });
    loadData();
  };

  const handleSavePayment = async () => {
    if (!payForm.vendor_id || !payForm.description || !payForm.amount) return;
    await supabase.from('vendor_payments').insert({
      dealer_id: dealerId, vendor_id: payForm.vendor_id, vehicle_id: payForm.vehicle_id || null,
      description: payForm.description, amount: parseFloat(payForm.amount),
      payment_date: payForm.payment_date, payment_method: payForm.payment_method,
      reference_number: payForm.reference_number || null, invoice_number: payForm.invoice_number || null,
      category: payForm.category || null,
    });
    // Update vendor total
    const vendor = vendors.find(v => v.id === payForm.vendor_id);
    if (vendor) {
      await supabase.from('vendors').update({ total_paid: (parseFloat(vendor.total_paid) || 0) + parseFloat(payForm.amount), total_jobs: (vendor.total_jobs || 0) + 1, last_used_at: new Date().toISOString() }).eq('id', vendor.id);
    }
    setShowPaymentModal(false);
    setPayForm({ vendor_id: '', vehicle_id: '', description: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'check', reference_number: '', invoice_number: '', category: '' });
    loadData();
  };

  const filtered = filterType === 'all' ? vendors : vendors.filter(v => v.vendor_type === filterType);
  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const activeVendors = vendors.filter(v => v.active).length;

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Vendor Management</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Track vendors, service providers, and payment history</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowPaymentModal(true)} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>+ Payment</button>
          <button onClick={() => { setEditingVendor(null); setVendorForm({ name: '', company: '', vendor_type: 'general', phone: '', email: '', address: '', city: '', state: '', zip: '', payment_terms: '', tax_id: '', w9_on_file: false }); setShowVendorModal(true); }} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Add Vendor</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Vendors', val: vendors.length, color: theme.text },
          { label: 'Active', val: activeVendors, color: '#22c55e' },
          { label: 'Total Payments', val: payments.length, color: '#3b82f6' },
          { label: 'Total Paid', val: formatCurrency(totalPaid), color: theme.accent },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'vendors', label: `Vendors (${vendors.length})` }, { id: 'payments', label: `Payments (${payments.length})` }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500', color: activeTab === t.id ? theme.accent : theme.textSecondary, borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent', marginBottom: '-1px' }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'vendors' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Types</option>
              {vendorTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {filtered.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted, gridColumn: '1 / -1' }}>No vendors found</div>
            ) : filtered.map(v => {
              const vPayments = payments.filter(p => p.vendor_id === v.id);
              return (
                <div key={v.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{v.name}</div>
                      {v.company && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{v.company}</div>}
                      <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: theme.accentBg, color: theme.accent, textTransform: 'capitalize' }}>{v.vendor_type}</span>
                    </div>
                    <button onClick={() => { setEditingVendor(v); setVendorForm({ name: v.name, company: v.company || '', vendor_type: v.vendor_type, phone: v.phone || '', email: v.email || '', address: v.address || '', city: v.city || '', state: v.state || '', zip: v.zip || '', payment_terms: v.payment_terms || '', tax_id: v.tax_id || '', w9_on_file: v.w9_on_file || false }); setShowVendorModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                  </div>
                  <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>
                    {v.phone && <span>{v.phone}</span>}{v.phone && v.email && ' • '}{v.email && <span>{v.email}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Jobs</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{v.total_jobs || 0}</div></div>
                    <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Total Paid</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{formatCurrency(v.total_paid)}</div></div>
                    <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>W-9</div><div style={{ color: v.w9_on_file ? '#22c55e' : '#ef4444', fontSize: '14px', fontWeight: '600' }}>{v.w9_on_file ? 'Yes' : 'No'}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {activeTab === 'payments' && (
        payments.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No payments recorded</div>
        ) : (
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Date', 'Vendor', 'Description', 'Vehicle', 'Method', 'Invoice #', 'Amount'].map(h => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: h === 'Amount' ? 'right' : 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => {
                  const vendor = vendors.find(v => v.id === p.vendor_id);
                  const vehicle = inventory?.find(v => v.id === p.vehicle_id);
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{formatDate(p.payment_date)}</td>
                      <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{vendor?.name || '-'}</td>
                      <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px' }}>{p.description}</td>
                      <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '-'}</td>
                      <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px', textTransform: 'capitalize' }}>{p.payment_method || '-'}</td>
                      <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{p.invoice_number || '-'}</td>
                      <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '600', textAlign: 'right' }}>{formatCurrency(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {showVendorModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowVendorModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Type</label>
              <select value={vendorForm.vendor_type} onChange={e => setVendorForm(p => ({ ...p, vendor_type: e.target.value }))} style={inputStyle}>
                {vendorTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {[
              { key: 'name', label: 'Name *' }, { key: 'company', label: 'Company' },
              { key: 'phone', label: 'Phone' }, { key: 'email', label: 'Email' },
              { key: 'address', label: 'Address' }, { key: 'city', label: 'City' },
              { key: 'state', label: 'State' }, { key: 'zip', label: 'ZIP' },
              { key: 'payment_terms', label: 'Payment Terms' }, { key: 'tax_id', label: 'Tax ID' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type="text" value={vendorForm[f.key]} onChange={e => setVendorForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.textSecondary, fontSize: '13px', marginBottom: '16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={vendorForm.w9_on_file} onChange={e => setVendorForm(p => ({ ...p, w9_on_file: e.target.checked }))} /> W-9 on file
            </label>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowVendorModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveVendor} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowPaymentModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Log Payment</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vendor *</label>
              <select value={payForm.vendor_id} onChange={e => setPayForm(p => ({ ...p, vendor_id: e.target.value }))} style={inputStyle}>
                <option value="">Select vendor...</option>
                {vendors.filter(v => v.active).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Vehicle (optional)</label>
              <select value={payForm.vehicle_id} onChange={e => setPayForm(p => ({ ...p, vehicle_id: e.target.value }))} style={inputStyle}>
                <option value="">None</option>
                {(inventory || []).map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - #{v.unit_id}</option>)}
              </select>
            </div>
            {[
              { key: 'description', label: 'Description *', type: 'text' },
              { key: 'amount', label: 'Amount ($) *', type: 'number' },
              { key: 'payment_date', label: 'Date', type: 'date' },
              { key: 'invoice_number', label: 'Invoice #', type: 'text' },
              { key: 'reference_number', label: 'Reference #', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={payForm[f.key]} onChange={e => setPayForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Method</label>
              <select value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))} style={inputStyle}>
                {['check', 'cash', 'card', 'ach', 'other'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowPaymentModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSavePayment} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
