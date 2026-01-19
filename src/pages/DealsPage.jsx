import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function DealsPage() {
  const location = useLocation();
  const { deals, inventory, customers, dealer, dealerId, fetchAllData, refreshDeals } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };

  useEffect(() => {
    if (dealerId && (!deals || deals.length === 0)) {
      fetchAllData();
    }
  }, [dealerId]);

  const [showScore, setShowScore] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [loadingScore, setLoadingScore] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showDocs, setShowDocs] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Customer autocomplete
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [newDeal, setNewDeal] = useState({
    vehicle_id: '', customer_id: '', purchaser_name: '', price: '', down_payment: '',
    term_months: '36', interest_rate: '18', credit_score: ''
  });

  // Check if navigated from customer page
  useEffect(() => {
    if (location.state?.customerId) {
      const customer = customers.find(c => c.id === location.state.customerId);
      if (customer) {
        setSelectedCustomer(customer);
        setCustomerSearch(customer.name);
        setNewDeal(prev => ({ ...prev, customer_id: customer.id, purchaser_name: customer.name }));
        setShowNew(true);
      }
    }
  }, [location.state, customers]);

  // Filter customers for autocomplete
  const filteredCustomers = customers.filter(c =>
    customerSearch && c.name?.toLowerCase().includes(customerSearch.toLowerCase())
  ).slice(0, 5);

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setNewDeal(prev => ({ ...prev, customer_id: customer.id, purchaser_name: customer.name }));
    setShowCustomerDropdown(false);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setNewDeal(prev => ({ ...prev, customer_id: '', purchaser_name: '' }));
  };

  const getDealScore = async (deal) => {
    setShowScore(deal);
    setLoadingScore(true);
    setScoreData(null);
    const vehicle = inventory.find(v => v.id == deal.vehicle_id);
    const currentYear = new Date().getFullYear();
    try {
      const { data, error } = await supabase.functions.invoke('deal-score', {
        body: {
          purchase_price: vehicle?.purchase_price || 10000,
          sale_price: deal.price || 15000,
          down_payment: deal.down_payment || 0,
          term_months: deal.term_months || 36,
          interest_rate: deal.interest_rate || 18,
          customer_credit_score: deal.credit_score || null,
          vehicle_age: vehicle ? currentYear - vehicle.year : 5,
          vehicle_miles: vehicle?.miles || vehicle?.mileage || 80000
        }
      });
      if (error) throw error;
      setScoreData(data);
    } catch (err) {
      setScoreData({ error: 'Could not calculate score' });
    } finally {
      setLoadingScore(false);
    }
  };

  const generateDocument = async (type, deal) => {
    setGenerating(true);
    try {
      // Document generation logic here
      alert(`Generating ${type} for ${deal.purchaser_name}`);
    } catch (err) {
      alert('Error generating document: ' + err.message);
    } finally {
      setGenerating(false);
      setShowDocs(null);
    }
  };

  const saveDeal = async () => {
    if (!newDeal.vehicle_id) { alert('Select a vehicle'); return; }
    if (!newDeal.purchaser_name) { alert('Enter customer name'); return; }
    if (!newDeal.price) { alert('Enter sale price'); return; }
    
    setSaving(true);
    try {
      const { error } = await supabase.from('deals').insert({
        vehicle_id: newDeal.vehicle_id,
        customer_id: newDeal.customer_id || null,
        purchaser_name: newDeal.purchaser_name,
        price: parseFloat(newDeal.price),
        down_payment: parseFloat(newDeal.down_payment) || 0,
        term_months: parseInt(newDeal.term_months) || 36,
        interest_rate: parseFloat(newDeal.interest_rate) || 18,
        credit_score: newDeal.credit_score ? parseInt(newDeal.credit_score) : null,
        date_of_sale: new Date().toISOString().split('T')[0],
        dealer_id: dealerId
      });
      
      if (error) throw error;
      
      // Update vehicle status to Sold
      await supabase.from('inventory').update({ status: 'Sold' }).eq('id', newDeal.vehicle_id);
      
      // Reset form
      setNewDeal({ vehicle_id: '', customer_id: '', purchaser_name: '', price: '', down_payment: '', term_months: '36', interest_rate: '18', credit_score: '' });
      setSelectedCustomer(null);
      setCustomerSearch('');
      setShowNew(false);
      
      if (refreshDeals) await refreshDeals();
      if (fetchAllData) await fetchAllData();
    } catch (err) {
      alert('Error creating deal: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px', outline: 'none' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', color: theme.textSecondary, fontWeight: '500' };
  const availableVehicles = inventory.filter(v => v.status === 'For Sale' || v.status === 'In Stock');

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Deals</h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>{deals.length} total deals</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ New Deal</button>
      </div>

      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.border }}>
              {['Customer', 'Vehicle', 'Price', 'Date', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((d, i) => {
              const vehicle = inventory.find(v => v.id == d.vehicle_id);
              return (
                <tr key={d.id || i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '14px 16px', color: theme.text, fontWeight: '500' }}>{d.purchaser_name || 'Unknown'}</td>
                  <td style={{ padding: '14px 16px', color: theme.textSecondary }}>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A'}</td>
                  <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '600' }}>${(d.price || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', color: theme.textSecondary }}>{d.date_of_sale || '-'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => getDealScore(d)} style={{ padding: '6px 12px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Score</button>
                      <button onClick={() => setShowDocs(d)} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Docs</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {deals.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No deals yet</div>}
      </div>

      {/* Document Generation Modal */}
      {showDocs && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Generate Documents</h2>
              <button onClick={() => setShowDocs(null)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: theme.border, borderRadius: '8px' }}>
              <div style={{ color: theme.text, fontWeight: '600' }}>{showDocs.purchaser_name}</div>
              <div style={{ color: theme.textMuted, fontSize: '13px' }}>{(() => { const v = inventory.find(x => x.id == showDocs.vehicle_id); return v ? `${v.year} ${v.make} ${v.model}` : 'N/A'; })()}</div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <button onClick={() => generateDocument('bill-of-sale', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <div>Bill of Sale</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: 'normal' }}>Legal transfer document</div>
              </button>
              <button onClick={() => generateDocument('buyers-guide', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <div>Buyer's Guide (AS-IS)</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: 'normal' }}>FTC required disclosure</div>
              </button>
              <button onClick={() => generateDocument('odometer', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <div>Odometer Disclosure</div>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: 'normal' }}>Federal mileage statement</div>
              </button>
              <button onClick={() => generateDocument('all', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                {generating ? 'Generating...' : 'Download All Documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deal Score Modal */}
      {showScore && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Deal Score</h2>
              <button onClick={() => setShowScore(null)} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            {loadingScore ? (
              <div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>Analyzing deal...</div>
            ) : scoreData?.error ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>{scoreData.error}</div>
            ) : scoreData ? (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '64px', fontWeight: '800', color: scoreData.color }}>{scoreData.rating}</div>
                  <div style={{ fontSize: '24px', color: theme.text, fontWeight: '600' }}>{scoreData.score} / 150</div>
                  <div style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: theme.border, borderRadius: '8px', display: 'inline-block' }}>
                    <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{scoreData.recommendation}</span>
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>PROFIT ANALYSIS</div>
                  <div style={{ backgroundColor: theme.border, padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: theme.textMuted }}>Purchase:</span><span style={{ color: theme.text }}>${scoreData.profit_analysis?.purchase_price?.toLocaleString()}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: theme.textMuted }}>Sale:</span><span style={{ color: theme.text }}>${scoreData.profit_analysis?.sale_price?.toLocaleString()}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: `1px solid ${theme.textMuted}` }}><span style={{ color: theme.textMuted }}>Profit:</span><span style={{ color: scoreData.profit_analysis?.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: '600' }}>${scoreData.profit_analysis?.profit?.toLocaleString()} ({scoreData.profit_analysis?.margin})</span></div>
                  </div>
                </div>
                <div>
                  <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>SCORE FACTORS</div>
                  {scoreData.factors?.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: theme.border, borderRadius: '8px', marginBottom: '8px' }}>
                      <div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{f.factor}</div><div style={{ color: theme.textMuted, fontSize: '12px' }}>{f.detail}</div></div>
                      <span style={{ color: f.impact.startsWith('+') ? '#4ade80' : f.impact.startsWith('-') ? '#f87171' : theme.textSecondary, fontWeight: '600', fontSize: '14px' }}>{f.impact}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* New Deal Modal */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '450px', border: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>New Deal</h2>
              <button onClick={() => { setShowNew(false); clearCustomer(); }} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Vehicle *</label>
                <select value={newDeal.vehicle_id} onChange={(e) => setNewDeal(prev => ({ ...prev, vehicle_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select vehicle...</option>
                  {availableVehicles.map(v => (<option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - ${v.sale_price?.toLocaleString()}</option>))}
                </select>
              </div>
              
              {/* Customer Autocomplete */}
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Customer *</label>
                {selectedCustomer ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', backgroundColor: '#22c55e20', border: '1px solid #22c55e', borderRadius: '8px' }}>
                    <span style={{ color: '#22c55e', flex: 1 }}>{selectedCustomer.name}</span>
                    <button onClick={clearCustomer} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: '18px' }}>×</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Type to search customers..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        setNewDeal(prev => ({ ...prev, purchaser_name: e.target.value }));
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      style={inputStyle}
                    />
                    {showCustomerDropdown && filteredCustomers.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', marginTop: '4px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                        {filteredCustomers.map(c => (
                          <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }} onMouseEnter={(e) => e.target.style.backgroundColor = theme.border} onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                            <div style={{ color: theme.text, fontWeight: '500' }}>{c.name}</div>
                            {c.phone && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{c.phone}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                  {selectedCustomer ? 'Existing customer selected' : 'Type to search or enter new customer name'}
                </div>
              </div>
              
              <div>
                <label style={labelStyle}>Sale Price *</label>
                <input type="number" value={newDeal.price} onChange={(e) => setNewDeal(prev => ({ ...prev, price: e.target.value }))} style={inputStyle} placeholder="$" />
              </div>
              <div>
                <label style={labelStyle}>Down Payment</label>
                <input type="number" value={newDeal.down_payment} onChange={(e) => setNewDeal(prev => ({ ...prev, down_payment: e.target.value }))} style={inputStyle} placeholder="$" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => { setShowNew(false); clearCustomer(); }} style={{ flex: 1, padding: '12px', backgroundColor: theme.border, color: theme.text, border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveDeal} disabled={saving} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Create Deal'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}