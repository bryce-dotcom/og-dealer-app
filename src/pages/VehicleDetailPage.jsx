import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';

export default function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { dealer, inventory, customers, deals, employees } = useStore();
  const dealerId = dealer?.id;

  const [vehicle, setVehicle] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [reconTasks, setReconTasks] = useState([]);
  const [listings, setListings] = useState([]);
  const [tradeIns, setTradeIns] = useState([]);
  const [gpsTracking, setGpsTracking] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'repair', vendor: '' });

  useEffect(() => {
    if (dealerId && id) loadAll();
  }, [dealerId, id]);

  const loadAll = async () => {
    setLoading(true);

    // Find vehicle from store first, then fallback to DB
    let v = inventory?.find(i => i.id === id);
    if (!v) {
      const { data } = await supabase.from('inventory').select('*').eq('id', id).eq('dealer_id', dealerId).maybeSingle();
      v = data;
    }
    setVehicle(v);

    // Load related data in parallel
    const [expRes, reconRes, listRes, tradeRes, gpsRes] = await Promise.all([
      supabase.from('inventory_expenses').select('*').eq('vehicle_id', id).eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('reconditioning_tasks').select('*').eq('vehicle_id', id).eq('dealer_id', dealerId).order('sort_order'),
      supabase.from('marketplace_listings').select('*').eq('vehicle_id', id).eq('dealer_id', dealerId).order('created_at', { ascending: false }),
      supabase.from('trade_ins').select('*').eq('inventory_id', id).eq('dealer_id', dealerId),
      supabase.from('vehicle_gps_tracking').select('*').eq('vehicle_id', id).eq('dealer_id', dealerId).maybeSingle(),
    ]);

    setExpenses(expRes.data || []);
    setReconTasks(reconRes.data || []);
    setListings(listRes.data || []);
    setTradeIns(tradeRes.data || []);
    setGpsTracking(gpsRes.data);

    // Load deal timeline if vehicle has deals
    if (v) {
      const { data: dealData } = await supabase.from('deals').select('id').eq('vehicle_id', id).eq('dealer_id', dealerId);
      if (dealData?.length) {
        const dealIds = dealData.map(d => d.id);
        const { data: tlData } = await supabase.from('deal_timeline').select('*').eq('dealer_id', dealerId).in('deal_id', dealIds).order('created_at', { ascending: false }).limit(20);
        setTimeline(tlData || []);
      }
    }

    setLoading(false);
  };

  const formatCurrency = (amt) => {
    if (amt == null) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amt);
  };

  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleAddExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) return;
    await supabase.from('inventory_expenses').insert({
      dealer_id: dealerId,
      vehicle_id: id,
      description: expenseForm.description,
      amount: parseFloat(expenseForm.amount),
      category: expenseForm.category,
      vendor: expenseForm.vendor || null,
    });
    setExpenseForm({ description: '', amount: '', category: 'repair', vendor: '' });
    setShowExpenseModal(false);
    loadAll();
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Loading vehicle...
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: theme.textMuted, marginBottom: '16px' }}>Vehicle not found</p>
        <button onClick={() => navigate('/inventory')} style={{ color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
          Back to Inventory
        </button>
      </div>
    );
  }

  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  const photos = vehicle.photos || [];
  const primaryPhoto = vehicle.primary_photo || photos[0];
  const allPhotos = primaryPhoto ? [primaryPhoto, ...photos.filter(p => p !== primaryPhoto)] : photos;
  const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const totalReconCost = reconTasks.reduce((s, t) => s + (parseFloat(t.actual_cost || t.estimated_cost) || 0), 0);
  const totalInvested = (parseFloat(vehicle.purchase_price) || 0) + totalExpenses + totalReconCost;
  const salePrice = parseFloat(vehicle.sale_price) || 0;
  const profit = vehicle.status === 'Sold' ? salePrice - totalInvested : null;
  const daysInStock = vehicle.date_acquired ? Math.floor((new Date() - new Date(vehicle.date_acquired)) / 86400000) : null;

  const reconCompleted = reconTasks.filter(t => t.status === 'completed').length;
  const reconTotal = reconTasks.length;
  const reconPercent = reconTotal > 0 ? Math.round((reconCompleted / reconTotal) * 100) : 0;

  const statusColors = {
    'In Stock': '#3b82f6', 'Sold': '#22c55e', 'BHPH': '#eab308', 'Pending': '#f97316', 'Wholesale': '#ef4444'
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'expenses', label: `Expenses (${expenses.length})` },
    { id: 'recon', label: `Recon (${reconTasks.length})` },
    { id: 'listings', label: `Listings (${listings.length})` },
    { id: 'activity', label: 'Activity' },
  ];

  const card = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  };

  const label = { color: theme.textMuted, fontSize: '12px', marginBottom: '4px' };
  const value = { color: theme.text, fontSize: '15px', fontWeight: '600' };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '8px 12px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ color: theme.text, fontSize: '24px', fontWeight: '700', margin: 0 }}>{title || 'Unknown Vehicle'}</h1>
          <span style={{ color: theme.textMuted, fontSize: '13px' }}>#{vehicle.unit_id} • VIN: {vehicle.vin || 'N/A'}</span>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
          backgroundColor: `${statusColors[vehicle.status] || '#3b82f6'}22`,
          color: statusColors[vehicle.status] || '#3b82f6',
        }}>
          {vehicle.status}
        </span>
      </div>

      {/* Photo + Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Photo Gallery */}
        <div style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden' }}>
          <div style={{ position: 'relative', height: '300px', backgroundColor: '#000' }}>
            {allPhotos.length > 0 ? (
              <img src={allPhotos[photoIndex]} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10h10zm0 0h6m-6 0v-4h6v4" /></svg>
              </div>
            )}
            {allPhotos.length > 1 && (
              <>
                <button onClick={() => setPhotoIndex(Math.max(0, photoIndex - 1))} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>‹</button>
                <button onClick={() => setPhotoIndex(Math.min(allPhotos.length - 1, photoIndex + 1))} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px' }}>›</button>
                <div style={{ position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', borderRadius: '12px', padding: '4px 10px', color: '#fff', fontSize: '12px' }}>
                  {photoIndex + 1} / {allPhotos.length}
                </div>
              </>
            )}
          </div>
          {allPhotos.length > 1 && (
            <div style={{ display: 'flex', gap: '4px', padding: '8px', overflowX: 'auto' }}>
              {allPhotos.map((p, i) => (
                <img key={i} src={p} alt="" onClick={() => setPhotoIndex(i)} style={{
                  width: '60px', height: '44px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer',
                  border: i === photoIndex ? `2px solid ${theme.accent}` : '2px solid transparent', opacity: i === photoIndex ? 1 : 0.6
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={card}>
              <div style={label}>Purchase Price</div>
              <div style={value}>{formatCurrency(vehicle.purchase_price)}</div>
            </div>
            <div style={card}>
              <div style={label}>Total Expenses</div>
              <div style={value}>{formatCurrency(totalExpenses)}</div>
            </div>
            <div style={card}>
              <div style={label}>Recon Cost</div>
              <div style={value}>{formatCurrency(totalReconCost)}</div>
            </div>
            <div style={card}>
              <div style={label}>Total Invested</div>
              <div style={{ ...value, color: theme.accent }}>{formatCurrency(totalInvested)}</div>
            </div>
            {vehicle.status === 'Sold' ? (
              <>
                <div style={card}>
                  <div style={label}>Sale Price</div>
                  <div style={value}>{formatCurrency(salePrice)}</div>
                </div>
                <div style={card}>
                  <div style={label}>Profit</div>
                  <div style={{ ...value, color: profit >= 0 ? '#22c55e' : '#ef4444' }}>{formatCurrency(profit)}</div>
                </div>
              </>
            ) : (
              <>
                <div style={card}>
                  <div style={label}>List Price</div>
                  <div style={value}>{formatCurrency(vehicle.sale_price || vehicle.purchase_price)}</div>
                </div>
                <div style={card}>
                  <div style={label}>Days in Stock</div>
                  <div style={{ ...value, color: daysInStock > 60 ? '#ef4444' : daysInStock > 30 ? '#eab308' : '#22c55e' }}>{daysInStock ?? '-'}</div>
                </div>
              </>
            )}
          </div>

          {/* Recon Progress */}
          {reconTotal > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={label}>Reconditioning Progress</div>
                <span style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>{reconCompleted}/{reconTotal}</span>
              </div>
              <div style={{ height: '8px', backgroundColor: theme.border, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${reconPercent}%`, backgroundColor: reconPercent === 100 ? '#22c55e' : theme.accent, borderRadius: '4px', transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {/* GPS Status */}
          {gpsTracking && (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: gpsTracking.active ? '#22c55e' : '#ef4444' }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>GPS {gpsTracking.active ? 'Active' : 'Inactive'}</div>
                <div style={{ color: theme.textMuted, fontSize: '12px' }}>{gpsTracking.provider || 'Manual'} • Last ping: {gpsTracking.last_ping_at ? formatDate(gpsTracking.last_ping_at) : 'Never'}</div>
              </div>
              {gpsTracking.starter_disabled && (
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>STARTER DISABLED</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500',
            color: activeTab === t.id ? theme.accent : theme.textSecondary,
            borderBottom: activeTab === t.id ? `2px solid ${theme.accent}` : '2px solid transparent',
            marginBottom: '-1px',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={card}>
            <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Vehicle Info</h3>
            {[
              ['Year', vehicle.year],
              ['Make', vehicle.make],
              ['Model', vehicle.model],
              ['Trim', vehicle.trim],
              ['Color', vehicle.color],
              ['Mileage', vehicle.miles?.toLocaleString()],
              ['VIN', vehicle.vin],
              ['Unit ID', vehicle.unit_id],
              ['Date Acquired', formatDate(vehicle.date_acquired)],
              ['Purchased From', vehicle.purchased_from],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textMuted, fontSize: '13px' }}>{k}</span>
                <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{v || '-'}</span>
              </div>
            ))}
          </div>

          <div>
            {/* Sale Info */}
            {vehicle.status === 'Sold' && (
              <div style={card}>
                <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Sale Info</h3>
                {[
                  ['Sale Price', formatCurrency(vehicle.sale_price)],
                  ['Sale Date', formatDate(vehicle.sale_date)],
                  ['Customer', vehicle.client_customer],
                  ['Profit', formatCurrency(profit)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <span style={{ color: theme.textMuted, fontSize: '13px' }}>{k}</span>
                    <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{v || '-'}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Marketplace Listings */}
            {listings.length > 0 && (
              <div style={card}>
                <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Marketplace Listings</h3>
                {listings.map(l => (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500', textTransform: 'capitalize' }}>{l.platform}</div>
                      <div style={{ color: theme.textMuted, fontSize: '11px' }}>Listed {formatDate(l.created_at)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: l.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(161,161,170,0.15)',
                        color: l.status === 'active' ? '#22c55e' : theme.textMuted,
                      }}>{l.status}</span>
                      {l.views > 0 && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{l.views} views</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Trade-Ins (vehicles traded in for this one) */}
            {tradeIns.length > 0 && (
              <div style={card}>
                <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Trade-In History</h3>
                {tradeIns.map(t => (
                  <div key={t.id} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}` }}>
                    <div style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{[t.year, t.make, t.model].filter(Boolean).join(' ')}</div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                      ACV: {formatCurrency(t.acv)} • Agreed: {formatCurrency(t.agreed_value)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {vehicle.notes && (
              <div style={card}>
                <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Notes</h3>
                <p style={{ color: theme.textSecondary, fontSize: '13px', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap' }}>{vehicle.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {activeTab === 'expenses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <span style={{ color: theme.text, fontSize: '18px', fontWeight: '600' }}>Total: {formatCurrency(totalExpenses)}</span>
            </div>
            <button onClick={() => setShowExpenseModal(true)} style={{ padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              + Add Expense
            </button>
          </div>

          {expenses.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No expenses recorded</div>
          ) : (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Date', 'Description', 'Category', 'Vendor', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Amount' ? 'right' : 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: '13px' }}>{formatDate(e.created_at)}</td>
                      <td style={{ padding: '10px 12px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{e.description}</td>
                      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: '13px', textTransform: 'capitalize' }}>{e.category || '-'}</td>
                      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: '13px' }}>{e.vendor || '-'}</td>
                      <td style={{ padding: '10px 12px', color: theme.text, fontSize: '13px', fontWeight: '600', textAlign: 'right' }}>{formatCurrency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recon Tab */}
      {activeTab === 'recon' && (
        <div>
          {reconTotal > 0 && (
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              {[
                { label: 'Total Tasks', val: reconTotal, color: theme.text },
                { label: 'Completed', val: reconCompleted, color: '#22c55e' },
                { label: 'In Progress', val: reconTasks.filter(t => t.status === 'in_progress').length, color: '#3b82f6' },
                { label: 'Est. Cost', val: formatCurrency(reconTasks.reduce((s, t) => s + (parseFloat(t.estimated_cost) || 0), 0)), color: theme.textSecondary },
                { label: 'Actual Cost', val: formatCurrency(totalReconCost), color: theme.accent },
              ].map((s, i) => (
                <div key={i} style={{ ...card, flex: 1, textAlign: 'center', marginBottom: 0 }}>
                  <div style={label}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: '20px', fontWeight: '700' }}>{s.val}</div>
                </div>
              ))}
            </div>
          )}

          {reconTasks.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No reconditioning tasks</div>
          ) : (
            reconTasks.map(t => (
              <div key={t.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '50%',
                  backgroundColor: t.status === 'completed' ? '#22c55e' : t.status === 'in_progress' ? '#3b82f6' : t.status === 'blocked' ? '#ef4444' : theme.textMuted,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{t.title}</div>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                    {t.task_type} • {t.assigned_name || t.vendor_name || 'Unassigned'}
                    {t.completed_at && ` • Done ${formatDate(t.completed_at)}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>{formatCurrency(t.actual_cost || t.estimated_cost)}</div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', textTransform: 'capitalize',
                    backgroundColor: t.status === 'completed' ? 'rgba(34,197,94,0.15)' : t.status === 'in_progress' ? 'rgba(59,130,246,0.15)' : 'rgba(161,161,170,0.15)',
                    color: t.status === 'completed' ? '#22c55e' : t.status === 'in_progress' ? '#3b82f6' : theme.textMuted,
                  }}>{t.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Listings Tab */}
      {activeTab === 'listings' && (
        <div>
          {listings.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>Not listed on any marketplace</div>
          ) : (
            listings.map(l => (
              <div key={l.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: theme.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textSecondary, fontSize: '18px', fontWeight: '700' }}>
                  {(l.platform || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500', textTransform: 'capitalize' }}>{l.platform}</div>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                    Listed {formatDate(l.created_at)} • {formatCurrency(l.listed_price)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  {l.views > 0 && <div style={{ textAlign: 'center' }}><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{l.views}</div><div style={{ color: theme.textMuted, fontSize: '10px' }}>Views</div></div>}
                  {l.inquiries > 0 && <div style={{ textAlign: 'center' }}><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{l.inquiries}</div><div style={{ color: theme.textMuted, fontSize: '10px' }}>Inquiries</div></div>}
                  {l.leads_generated > 0 && <div style={{ textAlign: 'center' }}><div style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{l.leads_generated}</div><div style={{ color: theme.textMuted, fontSize: '10px' }}>Leads</div></div>}
                  <span style={{
                    padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: '600',
                    backgroundColor: l.status === 'active' ? 'rgba(34,197,94,0.15)' : l.status === 'sold' ? 'rgba(59,130,246,0.15)' : 'rgba(161,161,170,0.15)',
                    color: l.status === 'active' ? '#22c55e' : l.status === 'sold' ? '#3b82f6' : theme.textMuted,
                  }}>{l.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div>
          {timeline.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '40px', color: theme.textMuted }}>No activity recorded</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '24px' }}>
              <div style={{ position: 'absolute', left: '8px', top: '0', bottom: '0', width: '2px', backgroundColor: theme.border }} />
              {timeline.map(ev => (
                <div key={ev.id} style={{ position: 'relative', marginBottom: '16px' }}>
                  <div style={{ position: 'absolute', left: '-20px', top: '6px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: theme.accent, border: `2px solid ${theme.bgCard}` }} />
                  <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{ev.title}</div>
                        {ev.description && <div style={{ color: theme.textSecondary, fontSize: '12px', marginTop: '4px' }}>{ev.description}</div>}
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDate(ev.created_at)}</div>
                    </div>
                    {ev.employee_name && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>by {ev.employee_name}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowExpenseModal(false)}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>Add Expense</h3>
            {[
              { key: 'description', label: 'Description', type: 'text' },
              { key: 'amount', label: 'Amount', type: 'number' },
              { key: 'vendor', label: 'Vendor (optional)', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>{f.label}</label>
                <input
                  type={f.type}
                  value={expenseForm[f.key]}
                  onChange={e => setExpenseForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: theme.textSecondary, fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>Category</label>
              <select value={expenseForm.category} onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))} style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
                {['repair', 'parts', 'detail', 'inspection', 'registration', 'transport', 'advertising', 'other'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowExpenseModal(false)} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
              <button onClick={handleAddExpense} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>Add Expense</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
