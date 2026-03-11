import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function FIProductsPage() {
  const { theme } = useTheme();
  const { dealer, deals } = useStore();
  const dealerId = dealer?.id;

  const [activeTab, setActiveTab] = useState('catalog');
  const [products, setProducts] = useState([]);
  const [dealProducts, setDealProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [prodForm, setProdForm] = useState({ product_type: 'warranty', name: '', provider: '', description: '', dealer_cost: '', retail_price: '', term_months: '', mileage_limit: '', deductible: '' });
  const [sellForm, setSellForm] = useState({ deal_id: '', product_id: '', sell_price: '', dealer_cost: '', term_months: '', deductible: '', contract_number: '' });

  const productTypes = [
    { value: 'gap', label: 'GAP Insurance' },
    { value: 'warranty', label: 'Extended Warranty' },
    { value: 'service_contract', label: 'Service Contract' },
    { value: 'tire_wheel', label: 'Tire & Wheel' },
    { value: 'paint_protection', label: 'Paint Protection' },
    { value: 'theft_deterrent', label: 'Theft Deterrent' },
    { value: 'key_replacement', label: 'Key Replacement' },
    { value: 'dent_repair', label: 'Dent Repair' },
    { value: 'windshield', label: 'Windshield' },
    { value: 'maintenance_plan', label: 'Maintenance Plan' },
    { value: 'credit_life', label: 'Credit Life' },
    { value: 'disability', label: 'Disability' },
    { value: 'custom', label: 'Custom' },
  ];

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const [pRes, dpRes] = await Promise.all([
      supabase.from('fi_products').select('*').eq('dealer_id', dealerId).order('sort_order'),
      supabase.from('fi_deal_products').select('*').eq('dealer_id', dealerId).order('created_at', { ascending: false }),
    ]);
    setProducts(pRes.data || []);
    setDealProducts(dpRes.data || []);
    setLoading(false);
  };

  const formatCurrency = (amt) => amt == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amt);

  const handleSaveProduct = async () => {
    if (!prodForm.name || !prodForm.product_type) return;
    const cost = parseFloat(prodForm.dealer_cost) || 0;
    const retail = parseFloat(prodForm.retail_price) || 0;
    const payload = {
      dealer_id: dealerId,
      product_type: prodForm.product_type,
      name: prodForm.name,
      provider: prodForm.provider || null,
      description: prodForm.description || null,
      dealer_cost: cost,
      retail_price: retail,
      profit: retail - cost,
      term_months: prodForm.term_months ? parseInt(prodForm.term_months) : null,
      mileage_limit: prodForm.mileage_limit ? parseInt(prodForm.mileage_limit) : null,
      deductible: prodForm.deductible ? parseFloat(prodForm.deductible) : null,
    };
    if (editingProduct) {
      await supabase.from('fi_products').update(payload).eq('id', editingProduct.id);
    } else {
      await supabase.from('fi_products').insert(payload);
    }
    setShowProductModal(false);
    setEditingProduct(null);
    setProdForm({ product_type: 'warranty', name: '', provider: '', description: '', dealer_cost: '', retail_price: '', term_months: '', mileage_limit: '', deductible: '' });
    loadData();
  };

  const handleSellProduct = async () => {
    if (!sellForm.deal_id || !sellForm.product_id) return;
    const prod = products.find(p => p.id === sellForm.product_id);
    const cost = parseFloat(sellForm.dealer_cost) || parseFloat(prod?.dealer_cost) || 0;
    const sell = parseFloat(sellForm.sell_price) || parseFloat(prod?.retail_price) || 0;
    await supabase.from('fi_deal_products').insert({
      dealer_id: dealerId,
      deal_id: parseInt(sellForm.deal_id),
      product_id: sellForm.product_id,
      product_type: prod?.product_type || 'custom',
      product_name: prod?.name || 'Product',
      dealer_cost: cost,
      sell_price: sell,
      profit: sell - cost,
      term_months: sellForm.term_months ? parseInt(sellForm.term_months) : prod?.term_months,
      deductible: sellForm.deductible ? parseFloat(sellForm.deductible) : prod?.deductible,
      contract_number: sellForm.contract_number || null,
      provider: prod?.provider || null,
      effective_date: new Date().toISOString().split('T')[0],
    });
    setShowSellModal(false);
    setSellForm({ deal_id: '', product_id: '', sell_price: '', dealer_cost: '', term_months: '', deductible: '', contract_number: '' });
    loadData();
  };

  const handleCancelProduct = async (dp) => {
    await supabase.from('fi_deal_products').update({
      status: 'cancelled',
      cancelled_date: new Date().toISOString().split('T')[0],
    }).eq('id', dp.id);
    loadData();
  };

  const filteredProducts = filterType === 'all' ? products : products.filter(p => p.product_type === filterType);
  const activeDealProducts = dealProducts.filter(dp => dp.status === 'active');
  const totalFIRevenue = activeDealProducts.reduce((s, dp) => s + (parseFloat(dp.sell_price) || 0), 0);
  const totalFIProfit = activeDealProducts.reduce((s, dp) => s + (parseFloat(dp.profit) || 0), 0);
  const avgPerDeal = activeDealProducts.length > 0 ? totalFIProfit / new Set(activeDealProducts.map(dp => dp.deal_id)).size : 0;

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>F&I Products</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Manage GAP, warranties, service contracts, and backend profit</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowSellModal(true)} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>
            Sell to Deal
          </button>
          <button onClick={() => { setEditingProduct(null); setProdForm({ product_type: 'warranty', name: '', provider: '', description: '', dealer_cost: '', retail_price: '', term_months: '', mileage_limit: '', deductible: '' }); setShowProductModal(true); }} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            + Add Product
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Products Sold', val: activeDealProducts.length, color: theme.text },
          { label: 'Total Revenue', val: formatCurrency(totalFIRevenue), color: theme.accent },
          { label: 'Total Profit', val: formatCurrency(totalFIProfit), color: '#22c55e' },
          { label: 'Avg Profit/Deal', val: formatCurrency(avgPerDeal), color: '#3b82f6' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'catalog', label: `Product Catalog (${products.length})` }, { id: 'sold', label: `Sold Products (${dealProducts.length})` }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
            color: activeTab === t.id ? theme.accent : theme.textSecondary,
            borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'catalog' && (
        <>
          <div style={{ marginBottom: '16px' }}>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Types</option>
              {productTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {filteredProducts.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No products configured</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filteredProducts.map(p => (
                <div key={p.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', backgroundColor: theme.accentBg, color: theme.accent, textTransform: 'uppercase' }}>
                        {productTypes.find(t => t.value === p.product_type)?.label || p.product_type}
                      </span>
                      <div style={{ color: theme.text, fontSize: '15px', fontWeight: '600', marginTop: '6px' }}>{p.name}</div>
                      {p.provider && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{p.provider}</div>}
                    </div>
                    <button onClick={() => { setEditingProduct(p); setProdForm({ product_type: p.product_type, name: p.name, provider: p.provider || '', description: p.description || '', dealer_cost: p.dealer_cost?.toString() || '', retail_price: p.retail_price?.toString() || '', term_months: p.term_months?.toString() || '', mileage_limit: p.mileage_limit?.toString() || '', deductible: p.deductible?.toString() || '' }); setShowProductModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Cost</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{formatCurrency(p.dealer_cost)}</div></div>
                    <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Retail</div><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{formatCurrency(p.retail_price)}</div></div>
                    <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Profit</div><div style={{ color: '#22c55e', fontSize: '14px', fontWeight: '600' }}>{formatCurrency(p.profit)}</div></div>
                  </div>
                  {(p.term_months || p.mileage_limit) && (
                    <div style={{ marginTop: '8px', color: theme.textMuted, fontSize: '12px' }}>
                      {p.term_months && `${p.term_months} months`}{p.term_months && p.mileage_limit && ' / '}{p.mileage_limit && `${p.mileage_limit.toLocaleString()} miles`}
                      {p.deductible && ` • ${formatCurrency(p.deductible)} deductible`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'sold' && (
        dealProducts.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No products sold yet</div>
        ) : (
          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Deal #', 'Product', 'Type', 'Provider', 'Sold For', 'Cost', 'Profit', 'Contract #', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dealProducts.map(dp => (
                  <tr key={dp.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>#{dp.deal_id}</td>
                    <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px' }}>{dp.product_name}</td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px', textTransform: 'capitalize' }}>{dp.product_type?.replace('_', ' ')}</td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{dp.provider || '-'}</td>
                    <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '600' }}>{formatCurrency(dp.sell_price)}</td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{formatCurrency(dp.dealer_cost)}</td>
                    <td style={{ padding: '10px 8px', color: '#22c55e', fontSize: '13px', fontWeight: '600' }}>{formatCurrency(dp.profit)}</td>
                    <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{dp.contract_number || '-'}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: dp.status === 'active' ? 'rgba(34,197,94,0.15)' : dp.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(161,161,170,0.15)',
                        color: dp.status === 'active' ? '#22c55e' : dp.status === 'cancelled' ? '#ef4444' : theme.textMuted,
                      }}>{dp.status}</span>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {dp.status === 'active' && (
                        <button onClick={() => handleCancelProduct(dp)} style={{ padding: '4px 10px', backgroundColor: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Product Modal */}
      {showProductModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowProductModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editingProduct ? 'Edit Product' : 'Add Product'}</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Type *</label>
              <select value={prodForm.product_type} onChange={e => setProdForm(p => ({ ...p, product_type: e.target.value }))} style={inputStyle}>
                {productTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {[
              { key: 'name', label: 'Product Name *', type: 'text' },
              { key: 'provider', label: 'Provider/Vendor', type: 'text' },
              { key: 'description', label: 'Description', type: 'text' },
              { key: 'dealer_cost', label: 'Dealer Cost ($)', type: 'number' },
              { key: 'retail_price', label: 'Retail Price ($)', type: 'number' },
              { key: 'term_months', label: 'Term (Months)', type: 'number' },
              { key: 'mileage_limit', label: 'Mileage Limit', type: 'number' },
              { key: 'deductible', label: 'Deductible ($)', type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={prodForm[f.key]} onChange={e => setProdForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowProductModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveProduct} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Product Modal */}
      {showSellModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowSellModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Sell Product to Deal</h3>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Deal *</label>
              <select value={sellForm.deal_id} onChange={e => setSellForm(p => ({ ...p, deal_id: e.target.value }))} style={inputStyle}>
                <option value="">Select deal...</option>
                {(deals || []).map(d => <option key={d.id} value={d.id}>#{d.id} - {d.customer_name || 'Unknown'}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Product *</label>
              <select value={sellForm.product_id} onChange={e => { const p = products.find(x => x.id === e.target.value); setSellForm(prev => ({ ...prev, product_id: e.target.value, sell_price: p?.retail_price?.toString() || '', dealer_cost: p?.dealer_cost?.toString() || '', term_months: p?.term_months?.toString() || '', deductible: p?.deductible?.toString() || '' })); }} style={inputStyle}>
                <option value="">Select product...</option>
                {products.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} ({formatCurrency(p.retail_price)})</option>)}
              </select>
            </div>
            {[
              { key: 'sell_price', label: 'Sell Price ($)', type: 'number' },
              { key: 'dealer_cost', label: 'Dealer Cost ($)', type: 'number' },
              { key: 'contract_number', label: 'Contract Number', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={sellForm[f.key]} onChange={e => setSellForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowSellModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSellProduct} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Sell Product</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
