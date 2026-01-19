import { useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { BillOfSale, BuyersGuide, OdometerDisclosure, downloadPDF } from '../lib/documents';

export default function DealsPage() {
  const { deals, inventory, dealer, dealerId } = useStore();
  const [showScore, setShowScore] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [loadingScore, setLoadingScore] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showDocs, setShowDocs] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [newDeal, setNewDeal] = useState({
    vehicle_id: '', purchaser_name: '', price: '', down_payment: '',
    term_months: '36', interest_rate: '18', credit_score: ''
  });

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
    const vehicle = inventory.find(v => v.id == deal.vehicle_id) || {};
    const customer = { name: deal.purchaser_name, address: '', phone: '' };
    const props = { dealer: dealer || {}, vehicle, customer, deal };

    try {
      if (type === 'bill-of-sale') {
        await downloadPDF(BillOfSale, props, `BillOfSale_${deal.purchaser_name?.replace(/\s/g, '_')}.pdf`);
      } else if (type === 'buyers-guide') {
        await downloadPDF(BuyersGuide, props, `BuyersGuide_${vehicle.year}_${vehicle.make}_${vehicle.model}.pdf`);
      } else if (type === 'odometer') {
        await downloadPDF(OdometerDisclosure, props, `Odometer_${vehicle.vin || 'disclosure'}.pdf`);
      } else if (type === 'all') {
        await downloadPDF(BillOfSale, props, `BillOfSale_${deal.purchaser_name?.replace(/\s/g, '_')}.pdf`);
        await downloadPDF(BuyersGuide, props, `BuyersGuide_${vehicle.year}_${vehicle.make}_${vehicle.model}.pdf`);
        await downloadPDF(OdometerDisclosure, props, `Odometer_${vehicle.vin || 'disclosure'}.pdf`);
      }
    } catch (err) {
      alert('Error generating document: ' + err.message);
    } finally {
      setGenerating(false);
      setShowDocs(null);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3f3f46', backgroundColor: '#09090b', color: '#fff', fontSize: '14px', outline: 'none' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', color: '#a1a1aa', fontWeight: '500' };
  const availableVehicles = inventory.filter(v => v.status === 'For Sale' || v.status === 'In Stock');

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#fff', margin: 0 }}>Deals</h1>
          <p style={{ color: '#71717a', margin: '4px 0 0', fontSize: '14px' }}>{deals.length} total deals</p>
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: '10px 20px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>+ New Deal</button>
      </div>

      <div style={{ backgroundColor: '#18181b', borderRadius: '12px', overflow: 'hidden', border: '1px solid #27272a' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#27272a' }}>
              {['Customer', 'Vehicle', 'Price', 'Date', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: '#a1a1aa', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((d, i) => {
              const vehicle = inventory.find(v => v.id == d.vehicle_id);
              return (
                <tr key={d.id || i} style={{ borderBottom: '1px solid #27272a' }}>
                  <td style={{ padding: '14px 16px', color: '#fff', fontWeight: '500' }}>{d.purchaser_name || 'Unknown'}</td>
                  <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'N/A'}</td>
                  <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: '600' }}>${(d.price || 0).toLocaleString()}</td>
                  <td style={{ padding: '14px 16px', color: '#a1a1aa' }}>{d.date_of_sale || '-'}</td>
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
        {deals.length === 0 && <div style={{ padding: '40px', textAlign: 'center', color: '#71717a' }}>No deals yet</div>}
      </div>

      {/* Document Generation Modal */}
      {showDocs && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Generate Documents</h2>
              <button onClick={() => setShowDocs(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#27272a', borderRadius: '8px' }}>
              <div style={{ color: '#fff', fontWeight: '600' }}>{showDocs.purchaser_name}</div>
              <div style={{ color: '#71717a', fontSize: '13px' }}>{(() => { const v = inventory.find(x => x.id == showDocs.vehicle_id); return v ? `${v.year} ${v.make} ${v.model}` : 'N/A'; })()}</div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <button onClick={() => generateDocument('bill-of-sale', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <div>Bill of Sale</div>
                <div style={{ fontSize: '12px', color: '#71717a', fontWeight: 'normal' }}>Legal transfer document</div>
              </button>
              <button onClick={() => generateDocument('buyers-guide', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <div>Buyer's Guide (AS-IS)</div>
                <div style={{ fontSize: '12px', color: '#71717a', fontWeight: 'normal' }}>FTC required disclosure</div>
              </button>
              <button onClick={() => generateDocument('odometer', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', textAlign: 'left' }}>
                <div>Odometer Disclosure</div>
                <div style={{ fontSize: '12px', color: '#71717a', fontWeight: 'normal' }}>Federal mileage statement</div>
              </button>
              <button onClick={() => generateDocument('all', showDocs)} disabled={generating} style={{ padding: '14px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                {generating ? 'Generating...' : 'Download All Documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deal Score Modal */}
      {showScore && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Deal Score</h2>
              <button onClick={() => setShowScore(null)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            {loadingScore ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>Analyzing deal...</div>
            ) : scoreData?.error ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#f87171' }}>{scoreData.error}</div>
            ) : scoreData ? (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '64px', fontWeight: '800', color: scoreData.color }}>{scoreData.rating}</div>
                  <div style={{ fontSize: '24px', color: '#fff', fontWeight: '600' }}>{scoreData.score} / 150</div>
                  <div style={{ marginTop: '8px', padding: '8px 16px', backgroundColor: '#27272a', borderRadius: '8px', display: 'inline-block' }}>
                    <span style={{ color: '#a1a1aa', fontSize: '13px' }}>{scoreData.recommendation}</span>
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>PROFIT ANALYSIS</div>
                  <div style={{ backgroundColor: '#27272a', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#71717a' }}>Purchase:</span><span style={{ color: '#fff' }}>${scoreData.profit_analysis?.purchase_price?.toLocaleString()}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ color: '#71717a' }}>Sale:</span><span style={{ color: '#fff' }}>${scoreData.profit_analysis?.sale_price?.toLocaleString()}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #3f3f46' }}><span style={{ color: '#71717a' }}>Profit:</span><span style={{ color: scoreData.profit_analysis?.profit >= 0 ? '#4ade80' : '#f87171', fontWeight: '600' }}>${scoreData.profit_analysis?.profit?.toLocaleString()} ({scoreData.profit_analysis?.margin})</span></div>
                  </div>
                </div>
                <div>
                  <div style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>SCORE FACTORS</div>
                  {scoreData.factors?.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#27272a', borderRadius: '8px', marginBottom: '8px' }}>
                      <div><div style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{f.factor}</div><div style={{ color: '#71717a', fontSize: '12px' }}>{f.detail}</div></div>
                      <span style={{ color: f.impact.startsWith('+') ? '#4ade80' : f.impact.startsWith('-') ? '#f87171' : '#a1a1aa', fontWeight: '600', fontSize: '14px' }}>{f.impact}</span>
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
          <div style={{ backgroundColor: '#18181b', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '450px', border: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>New Deal</h2>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div><label style={labelStyle}>Vehicle *</label><select value={newDeal.vehicle_id} onChange={(e) => setNewDeal(prev => ({ ...prev, vehicle_id: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}><option value="">Select vehicle...</option>{availableVehicles.map(v => (<option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - ${v.sale_price?.toLocaleString()}</option>))}</select></div>
              <div><label style={labelStyle}>Customer Name *</label><input type="text" value={newDeal.purchaser_name} onChange={(e) => setNewDeal(prev => ({ ...prev, purchaser_name: e.target.value }))} style={inputStyle} /></div>
              <div><label style={labelStyle}>Sale Price *</label><input type="number" value={newDeal.price} onChange={(e) => setNewDeal(prev => ({ ...prev, price: e.target.value }))} style={inputStyle} placeholder="$" /></div>
              <div><label style={labelStyle}>Down Payment</label><input type="number" value={newDeal.down_payment} onChange={(e) => setNewDeal(prev => ({ ...prev, down_payment: e.target.value }))} style={inputStyle} placeholder="$" /></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: '12px', backgroundColor: '#27272a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => alert('Save deal - connect to Supabase')} style={{ flex: 1, padding: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Create Deal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}