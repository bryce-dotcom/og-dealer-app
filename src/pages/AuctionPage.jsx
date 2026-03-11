import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function AuctionPage() {
  const { theme } = useTheme();
  const { dealer, inventory } = useStore();
  const dealerId = dealer?.id;

  const [activeTab, setActiveTab] = useState('transactions');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingBuyer, setEditingBuyer] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterAuction, setFilterAuction] = useState('all');
  const [acctForm, setAcctForm] = useState({ auction_name: '', location: '', contact_name: '', contact_phone: '', contact_email: '', account_number: '', buyer_number: '', buy_fee: '', sell_fee: '' });
  const [txnForm, setTxnForm] = useState({ auction_id: '', transaction_type: 'buy', transaction_date: new Date().toISOString().split('T')[0], vin: '', year: '', make: '', model: '', mileage: '', hammer_price: '', buy_fee: '', sell_fee: '', transport_cost: '', run_number: '', lane: '', condition_grade: '' });
  const [buyerForm, setBuyerForm] = useState({ name: '', company: '', phone: '', email: '', dealer_license: '', price_range_min: '', price_range_max: '' });

  useEffect(() => { if (dealerId) loadData(); }, [dealerId]);

  const loadData = async () => {
    setLoading(true);
    const [aRes, tRes, bRes] = await Promise.all([
      supabase.from('auction_accounts').select('*').eq('dealer_id', dealerId).order('auction_name'),
      supabase.from('auction_transactions').select('*').eq('dealer_id', dealerId).order('transaction_date', { ascending: false }),
      supabase.from('wholesale_buyers').select('*').eq('dealer_id', dealerId).order('name'),
    ]);
    setAccounts(aRes.data || []);
    setTransactions(tRes.data || []);
    setBuyers(bRes.data || []);
    setLoading(false);
  };

  const formatCurrency = (amt) => amt == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amt);
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  const handleSaveAccount = async () => {
    if (!acctForm.auction_name) return;
    const payload = {
      dealer_id: dealerId,
      auction_name: acctForm.auction_name,
      location: acctForm.location || null,
      contact_name: acctForm.contact_name || null,
      contact_phone: acctForm.contact_phone || null,
      contact_email: acctForm.contact_email || null,
      account_number: acctForm.account_number || null,
      buyer_number: acctForm.buyer_number || null,
      buy_fee: acctForm.buy_fee ? parseFloat(acctForm.buy_fee) : 0,
      sell_fee: acctForm.sell_fee ? parseFloat(acctForm.sell_fee) : 0,
    };
    if (editingAccount) {
      await supabase.from('auction_accounts').update(payload).eq('id', editingAccount.id);
    } else {
      await supabase.from('auction_accounts').insert(payload);
    }
    setShowAccountModal(false);
    setEditingAccount(null);
    setAcctForm({ auction_name: '', location: '', contact_name: '', contact_phone: '', contact_email: '', account_number: '', buyer_number: '', buy_fee: '', sell_fee: '' });
    loadData();
  };

  const handleSaveTxn = async () => {
    if (!txnForm.auction_id || !txnForm.hammer_price) return;
    const hammer = parseFloat(txnForm.hammer_price) || 0;
    const buyFee = parseFloat(txnForm.buy_fee) || 0;
    const sellFee = parseFloat(txnForm.sell_fee) || 0;
    const transport = parseFloat(txnForm.transport_cost) || 0;
    await supabase.from('auction_transactions').insert({
      dealer_id: dealerId,
      auction_id: txnForm.auction_id,
      transaction_type: txnForm.transaction_type,
      transaction_date: txnForm.transaction_date,
      vin: txnForm.vin || null,
      year: txnForm.year ? parseInt(txnForm.year) : null,
      make: txnForm.make || null,
      model: txnForm.model || null,
      mileage: txnForm.mileage ? parseInt(txnForm.mileage) : null,
      hammer_price: hammer,
      buy_fee: buyFee,
      sell_fee: sellFee,
      transport_cost: transport,
      total_cost: txnForm.transaction_type === 'buy' ? hammer + buyFee + transport : null,
      total_proceeds: txnForm.transaction_type === 'sell' ? hammer - sellFee : null,
      run_number: txnForm.run_number || null,
      lane: txnForm.lane || null,
      condition_grade: txnForm.condition_grade || null,
      status: 'completed',
      arbitration_status: 'none',
    });
    setShowTxnModal(false);
    setTxnForm({ auction_id: '', transaction_type: 'buy', transaction_date: new Date().toISOString().split('T')[0], vin: '', year: '', make: '', model: '', mileage: '', hammer_price: '', buy_fee: '', sell_fee: '', transport_cost: '', run_number: '', lane: '', condition_grade: '' });
    loadData();
  };

  const handleSaveBuyer = async () => {
    if (!buyerForm.name) return;
    const payload = {
      dealer_id: dealerId,
      name: buyerForm.name,
      company: buyerForm.company || null,
      phone: buyerForm.phone || null,
      email: buyerForm.email || null,
      dealer_license: buyerForm.dealer_license || null,
      price_range_min: buyerForm.price_range_min ? parseFloat(buyerForm.price_range_min) : null,
      price_range_max: buyerForm.price_range_max ? parseFloat(buyerForm.price_range_max) : null,
    };
    if (editingBuyer) {
      await supabase.from('wholesale_buyers').update(payload).eq('id', editingBuyer.id);
    } else {
      await supabase.from('wholesale_buyers').insert(payload);
    }
    setShowBuyerModal(false);
    setEditingBuyer(null);
    setBuyerForm({ name: '', company: '', phone: '', email: '', dealer_license: '', price_range_min: '', price_range_max: '' });
    loadData();
  };

  const filteredTxns = transactions.filter(t => {
    if (filterType !== 'all' && t.transaction_type !== filterType) return false;
    if (filterAuction !== 'all' && t.auction_id !== filterAuction) return false;
    return true;
  });

  const buys = transactions.filter(t => t.transaction_type === 'buy');
  const sells = transactions.filter(t => t.transaction_type === 'sell');
  const totalBought = buys.reduce((s, t) => s + (parseFloat(t.total_cost) || 0), 0);
  const totalSold = sells.reduce((s, t) => s + (parseFloat(t.total_proceeds) || 0), 0);

  const card = { backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', padding: '20px' };
  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>Auction & Wholesale</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', margin: '4px 0 0' }}>Manage auction buying/selling and wholesale buyers</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setEditingBuyer(null); setBuyerForm({ name: '', company: '', phone: '', email: '', dealer_license: '', price_range_min: '', price_range_max: '' }); setShowBuyerModal(true); }} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>+ Buyer</button>
          <button onClick={() => { setEditingAccount(null); setAcctForm({ auction_name: '', location: '', contact_name: '', contact_phone: '', contact_email: '', account_number: '', buyer_number: '', buy_fee: '', sell_fee: '' }); setShowAccountModal(true); }} style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>+ Auction</button>
          <button onClick={() => setShowTxnModal(true)} style={{ padding: '10px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>+ Transaction</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Vehicles Bought', val: buys.length, color: theme.text },
          { label: 'Total Spent', val: formatCurrency(totalBought), color: '#ef4444' },
          { label: 'Vehicles Sold', val: sells.length, color: theme.text },
          { label: 'Total Proceeds', val: formatCurrency(totalSold), color: '#22c55e' },
          { label: 'Wholesale Buyers', val: buyers.filter(b => b.active).length, color: '#3b82f6' },
        ].map((s, i) => (
          <div key={i} style={{ ...card, textAlign: 'center' }}>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}` }}>
        {[{ id: 'transactions', label: `Transactions (${transactions.length})` }, { id: 'auctions', label: `Auctions (${accounts.length})` }, { id: 'buyers', label: `Wholesale Buyers (${buyers.length})` }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
            color: activeTab === t.id ? theme.accent : theme.textSecondary,
            borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'transactions' && (
        <>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Types</option>
              <option value="buy">Buys</option>
              <option value="sell">Sells</option>
            </select>
            <select value={filterAuction} onChange={e => setFilterAuction(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="all">All Auctions</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.auction_name}</option>)}
            </select>
          </div>
          {filteredTxns.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No transactions found</div>
          ) : (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Date', 'Type', 'Auction', 'Vehicle', 'Hammer', 'Fees', 'Transport', 'Total', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map(t => {
                    const auction = accounts.find(a => a.id === t.auction_id);
                    return (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{formatDate(t.transaction_date)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: t.transaction_type === 'buy' ? 'rgba(59,130,246,0.15)' : 'rgba(34,197,94,0.15)', color: t.transaction_type === 'buy' ? '#3b82f6' : '#22c55e' }}>{t.transaction_type}</span>
                        </td>
                        <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px' }}>{auction?.auction_name || '-'}</td>
                        <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{[t.year, t.make, t.model].filter(Boolean).join(' ') || '-'}</td>
                        <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{formatCurrency(t.hammer_price)}</td>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{formatCurrency((parseFloat(t.buy_fee) || 0) + (parseFloat(t.sell_fee) || 0))}</td>
                        <td style={{ padding: '10px 8px', color: theme.textSecondary, fontSize: '13px' }}>{formatCurrency(t.transport_cost)}</td>
                        <td style={{ padding: '10px 8px', color: theme.accent, fontSize: '13px', fontWeight: '600' }}>{formatCurrency(t.total_cost || t.total_proceeds)}</td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: t.arbitration_status !== 'none' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: t.arbitration_status !== 'none' ? '#ef4444' : '#22c55e' }}>
                            {t.arbitration_status !== 'none' ? `Arb: ${t.arbitration_status}` : t.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'auctions' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {accounts.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted, gridColumn: '1 / -1' }}>No auction accounts</div>
          ) : accounts.map(a => {
            const aTxns = transactions.filter(t => t.auction_id === a.id);
            return (
              <div key={a.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>{a.auction_name}</div>
                    {a.location && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{a.location}</div>}
                  </div>
                  <button onClick={() => { setEditingAccount(a); setAcctForm({ auction_name: a.auction_name, location: a.location || '', contact_name: a.contact_name || '', contact_phone: a.contact_phone || '', contact_email: a.contact_email || '', account_number: a.account_number || '', buyer_number: a.buyer_number || '', buy_fee: a.buy_fee?.toString() || '', sell_fee: a.sell_fee?.toString() || '' }); setShowAccountModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Acct #</div><div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{a.account_number || '-'}</div></div>
                  <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Buy Fee</div><div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{formatCurrency(a.buy_fee)}</div></div>
                  <div><div style={{ color: theme.textMuted, fontSize: '11px' }}>Transactions</div><div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{aTxns.length}</div></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'buyers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {buyers.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted, gridColumn: '1 / -1' }}>No wholesale buyers</div>
          ) : buyers.map(b => (
            <div key={b.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div>
                  <div style={{ color: theme.text, fontSize: '15px', fontWeight: '600' }}>{b.name}</div>
                  {b.company && <div style={{ color: theme.textMuted, fontSize: '12px' }}>{b.company}</div>}
                </div>
                <button onClick={() => { setEditingBuyer(b); setBuyerForm({ name: b.name, company: b.company || '', phone: b.phone || '', email: b.email || '', dealer_license: b.dealer_license || '', price_range_min: b.price_range_min?.toString() || '', price_range_max: b.price_range_max?.toString() || '' }); setShowBuyerModal(true); }} style={{ padding: '4px 10px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Edit</button>
              </div>
              <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>{b.phone || ''}{b.phone && b.email ? ' • ' : ''}{b.email || ''}</div>
              {(b.price_range_min || b.price_range_max) && (
                <div style={{ color: theme.textMuted, fontSize: '12px' }}>Budget: {formatCurrency(b.price_range_min)} - {formatCurrency(b.price_range_max)}</div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <span style={{ color: theme.textMuted, fontSize: '11px' }}>Purchases: {b.total_purchases || 0}</span>
                <span style={{ color: theme.textMuted, fontSize: '11px' }}>Spent: {formatCurrency(b.total_spent)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Account Modal */}
      {showAccountModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowAccountModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editingAccount ? 'Edit Auction' : 'Add Auction'}</h3>
            {[
              { key: 'auction_name', label: 'Auction Name *', type: 'text' },
              { key: 'location', label: 'Location', type: 'text' },
              { key: 'account_number', label: 'Account #', type: 'text' },
              { key: 'buyer_number', label: 'Buyer #', type: 'text' },
              { key: 'contact_name', label: 'Contact', type: 'text' },
              { key: 'contact_phone', label: 'Phone', type: 'text' },
              { key: 'contact_email', label: 'Email', type: 'email' },
              { key: 'buy_fee', label: 'Buy Fee ($)', type: 'number' },
              { key: 'sell_fee', label: 'Sell Fee ($)', type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={acctForm[f.key]} onChange={e => setAcctForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowAccountModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveAccount} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTxnModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowTxnModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '520px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Log Transaction</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Auction *</label>
                <select value={txnForm.auction_id} onChange={e => setTxnForm(p => ({ ...p, auction_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.auction_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>Type *</label>
                <select value={txnForm.transaction_type} onChange={e => setTxnForm(p => ({ ...p, transaction_type: e.target.value }))} style={inputStyle}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
            </div>
            {[
              { key: 'transaction_date', label: 'Date', type: 'date' },
              { key: 'vin', label: 'VIN', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={txnForm[f.key]} onChange={e => setTxnForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {[{ key: 'year', label: 'Year' }, { key: 'make', label: 'Make' }, { key: 'model', label: 'Model' }].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                  <input type="text" value={txnForm[f.key]} onChange={e => setTxnForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
            </div>
            {[
              { key: 'hammer_price', label: 'Hammer Price ($) *', type: 'number' },
              { key: 'buy_fee', label: 'Buy Fee ($)', type: 'number' },
              { key: 'sell_fee', label: 'Sell Fee ($)', type: 'number' },
              { key: 'transport_cost', label: 'Transport ($)', type: 'number' },
              { key: 'run_number', label: 'Run #', type: 'text' },
              { key: 'lane', label: 'Lane', type: 'text' },
              { key: 'condition_grade', label: 'Condition Grade', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={txnForm[f.key]} onChange={e => setTxnForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowTxnModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveTxn} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Buyer Modal */}
      {showBuyerModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowBuyerModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>{editingBuyer ? 'Edit Buyer' : 'Add Wholesale Buyer'}</h3>
            {[
              { key: 'name', label: 'Name *', type: 'text' },
              { key: 'company', label: 'Company', type: 'text' },
              { key: 'phone', label: 'Phone', type: 'text' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'dealer_license', label: 'Dealer License #', type: 'text' },
              { key: 'price_range_min', label: 'Min Budget ($)', type: 'number' },
              { key: 'price_range_max', label: 'Max Budget ($)', type: 'number' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>{f.label}</label>
                <input type={f.type} value={buyerForm[f.key]} onChange={e => setBuyerForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowBuyerModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleSaveBuyer} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
