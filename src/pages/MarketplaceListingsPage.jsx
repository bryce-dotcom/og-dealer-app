import { useState, useEffect } from 'react';
import { useTheme } from '../components/Layout';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function MarketplaceListingsPage() {
  const { theme } = useTheme();
  const { dealerId, inventory } = useStore();
  const [loading, setLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [activeMarketplace, setActiveMarketplace] = useState('all');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Only these three are allowed by the marketplace_listings table (CHECK constraint)
  const marketplaces = {
    facebook: { name: 'Facebook', color: '#1877f2', icon: 'f' },
    ksl: { name: 'KSL', color: '#00a550', icon: 'K' },
    autotrader: { name: 'AutoTrader', color: '#ef4444', icon: 'A' }
  };

  // Allowed statuses: pending, active, sold, removed, error. Friendly labels, since nothing is posted automatically yet.
  const statusLabels = { pending: 'Not posted yet', active: 'Posted', sold: 'Sold', removed: 'Taken down', error: 'Error' };

  const getVehicle = (id) => (inventory || []).find(v => v.id === id);
  const vehicleTitle = (listing) => {
    const v = getVehicle(listing.inventory_id);
    if (v) return `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}`;
    return listing.metadata?.title || 'Vehicle no longer in inventory';
  };
  const vehiclePrice = (v) => v ? (v.list_price ?? v.sale_price ?? null) : null;

  useEffect(() => { if (dealerId) loadListings(); }, [dealerId]);

  async function loadListings() {
    setLoading(true);
    const { data, error } = await supabase.from('marketplace_listings')
      .select('*')
      .eq('dealer_id', dealerId)
      .order('created_at', { ascending: false });
    if (error) console.error('Failed to load listings:', error);
    setListings(data || []);
    setLoading(false);
  }

  const availableVehicles = (inventory || []).filter(v => ['In Stock', 'For Sale'].includes(v.status));

  // Stats (only columns that exist; views/inquiries/leads are not tracked)
  const stats = {
    total: listings.length,
    active: listings.filter(l => l.status === 'active').length,
    pending: listings.filter(l => l.status === 'pending').length,
    removed: listings.filter(l => l.status === 'removed').length,
    errors: listings.filter(l => l.status === 'error').length
  };

  // Filter listings
  let filtered = listings;
  if (activeMarketplace !== 'all') filtered = filtered.filter(l => l.marketplace === activeMarketplace);
  if (statusFilter !== 'all') filtered = filtered.filter(l => l.status === statusFilter);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(l => {
      const v = getVehicle(l.inventory_id);
      return vehicleTitle(l).toLowerCase().includes(s) || (v?.stock_number || '').toLowerCase().includes(s) || (v?.vin || '').toLowerCase().includes(s);
    });
  }

  async function handleBulkPublish(marketplace) {
    if (selectedVehicles.length === 0) { alert('Select at least one vehicle'); return; }
    setPublishing(true);
    try {
      // marketplace_listings columns: inventory_id, marketplace, status, metadata (jsonb). Listing details go in metadata.
      const rows = selectedVehicles.map(vehicleId => {
        const v = availableVehicles.find(av => av.id === vehicleId);
        const miles = v ? (v.miles || v.mileage) : null;
        return {
          dealer_id: dealerId,
          inventory_id: vehicleId,
          marketplace,
          status: 'pending',
          error_message: null,
          updated_at: new Date().toISOString(),
          metadata: {
            title: v ? `${v.year} ${v.make} ${v.model} ${v.trim || ''}`.trim() : vehicleId,
            description: v ? (v.description || `${v.year} ${v.make} ${v.model}. ${miles ? Number(miles).toLocaleString() + ' miles.' : ''} ${v.color || ''}`.trim()) : '',
            price: vehiclePrice(v),
            images: Array.isArray(v?.photos) ? v.photos : []
          }
        };
      });

      // One row per car per site (unique dealer_id + inventory_id + marketplace), so re-adding a taken-down car reuses its row
      const { error } = await supabase.from('marketplace_listings').upsert(rows, { onConflict: 'dealer_id,inventory_id,marketplace' });
      if (error) throw error;
      setShowPublishModal(false);
      setSelectedVehicles([]);
      loadListings();
    } catch (err) {
      alert('Failed to create listings: ' + err.message);
    }
    setPublishing(false);
  }

  async function handleUpdateStatus(id, newStatus) {
    const { error } = await supabase.from('marketplace_listings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to update listing: ' + error.message); return; }
    loadListings();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this listing record from OG Dealer? (This does not touch any ad you posted yourself.)')) return;
    const { error } = await supabase.from('marketplace_listings').delete().eq('id', id).eq('dealer_id', dealerId);
    if (error) { alert('Failed to delete listing: ' + error.message); return; }
    loadListings();
  }

  async function handleBulkAction(action) {
    const activeIds = filtered.filter(l => l.status === 'active').map(l => l.id);
    if (activeIds.length === 0) { alert('There are no "Posted" listings in this view.'); return; }

    // The table has no "paused" status, so taking listings down marks them "removed"
    if (action === 'remove') {
      if (!confirm(`Mark ${activeIds.length} posted listing${activeIds.length > 1 ? 's' : ''} as taken down?\n\nThis only updates OG Dealer. You still need to remove the ads on the sites yourself.`)) return;
      const { error } = await supabase.from('marketplace_listings').update({ status: 'removed', updated_at: new Date().toISOString() }).in('id', activeIds).eq('dealer_id', dealerId);
      if (error) { alert('Failed to update listings: ' + error.message); return; }
    }
    loadListings();
  }

  function getStatusStyle(status) {
    const map = {
      draft: { bg: 'rgba(113,113,122,0.15)', color: '#71717a' },
      pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
      active: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
      paused: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
      sold: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' },
      expired: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
      error: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
      removed: { bg: 'rgba(113,113,122,0.15)', color: '#71717a' }
    };
    return map[status] || map.draft;
  }

  if (loading) {
    return <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div style={{ color: theme.textSecondary }}>Loading listings...</div>
    </div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Marketplace Listings</h1>
          <p style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>Keep track of which cars you've listed on which sites</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => handleBulkAction('remove')} title="Mark every Posted listing in this view as taken down" style={{ padding: '10px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer', fontSize: '13px' }}>Mark All Taken Down</button>
          <button onClick={() => setShowPublishModal(true)} style={{ padding: '10px 20px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>+ Add Listings</button>
        </div>
      </div>

      {/* Honest integration notice */}
      <div style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', color: theme.text, fontSize: '13px' }}>
        <strong style={{ color: '#f59e0b' }}>Nothing is posted to Facebook, KSL or AutoTrader from here yet.</strong> This page is a checklist: add a car for a site, post the ad yourself on that site, then click "Mark as posted".
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Listings', value: stats.total, color: theme.text },
          { label: 'Posted', value: stats.active, color: '#22c55e' },
          { label: 'Not Posted Yet', value: stats.pending, color: '#f59e0b' },
          { label: 'Taken Down', value: stats.removed, color: '#71717a' },
          { label: 'Errors', value: stats.errors, color: '#ef4444' }
        ].map((s, i) => (
          <div key={i} style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Marketplace Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveMarketplace('all')} style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${activeMarketplace === 'all' ? theme.accent : theme.border}`, backgroundColor: activeMarketplace === 'all' ? theme.accentBg : 'transparent', color: activeMarketplace === 'all' ? theme.accent : theme.textSecondary, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          All ({listings.length})
        </button>
        {Object.entries(marketplaces).map(([key, mp]) => {
          const count = listings.filter(l => l.marketplace === key).length;
          return (
            <button key={key} onClick={() => setActiveMarketplace(key)} style={{ padding: '8px 16px', borderRadius: '8px', border: `1px solid ${activeMarketplace === key ? mp.color : theme.border}`, backgroundColor: activeMarketplace === key ? `${mp.color}20` : 'transparent', color: activeMarketplace === key ? mp.color : theme.textSecondary, cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '4px', backgroundColor: mp.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700' }}>{mp.icon}</span>
              {mp.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search listings..." style={{ flex: 1, padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '10px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px' }}>
          <option value="all">All Status</option>
          {Object.entries(statusLabels).map(([s, label]) => (
            <option key={s} value={s}>{label}</option>
          ))}
        </select>
      </div>

      {/* Listings Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏪</div>
          <p>{listings.length === 0 ? 'No listings yet. Click "+ Add Listings" to start tracking which cars are on which sites.' : 'No listings match these filters.'}</p>
        </div>
      ) : (
        <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Vehicle', 'Site', 'Price', 'Status', 'Added', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(listing => {
                const mp = marketplaces[listing.marketplace] || {};
                const st = getStatusStyle(listing.status);
                return (
                  <tr key={listing.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ color: theme.text, fontWeight: '500', fontSize: '14px' }}>{vehicleTitle(listing)}</div>
                      {getVehicle(listing.inventory_id)?.stock_number && <div style={{ color: theme.textMuted, fontSize: '12px' }}>Stock #{getVehicle(listing.inventory_id).stock_number}</div>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: mp.color || '#666', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700' }}>{mp.icon || '?'}</span>
                        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{mp.name || listing.marketplace}</span>
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.text, fontWeight: '600' }}>{listing.metadata?.price != null ? `$${parseFloat(listing.metadata.price).toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', backgroundColor: st.bg, color: st.color }}>{statusLabels[listing.status] || listing.status}</span>
                      {listing.error_message && <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '2px' }}>{listing.error_message}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '13px' }}>{listing.created_at ? new Date(listing.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {listing.status === 'active' && (
                          <button onClick={() => handleUpdateStatus(listing.id, 'removed')} title="You took the ad down on the site" style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: theme.textSecondary, cursor: 'pointer', fontSize: '11px' }}>Mark taken down</button>
                        )}
                        {['pending', 'removed', 'error'].includes(listing.status) && (
                          <button onClick={() => handleUpdateStatus(listing.id, 'active')} title="You posted this car on the site yourself" style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: '#22c55e', cursor: 'pointer', fontSize: '11px' }}>Mark as posted</button>
                        )}
                        {listing.metadata?.external_url && (
                          <a href={listing.metadata.external_url} target="_blank" rel="noopener noreferrer" style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: '#3b82f6', fontSize: '11px', textDecoration: 'none' }}>View</a>
                        )}
                        <button onClick={() => handleDelete(listing.id)} style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '4px', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Publish Modal */}
      {showPublishModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', width: '700px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Add Listings</h2>
            <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '20px' }}>Tick the cars, then pick the site. This only adds them to your listing checklist in OG Dealer; nothing is posted to the site.</p>

            {/* Marketplace Selection */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {Object.entries(marketplaces).map(([key, mp]) => (
                <button key={key} onClick={() => handleBulkPublish(key)} disabled={publishing || selectedVehicles.length === 0} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${mp.color}`, backgroundColor: `${mp.color}15`, color: mp.color, cursor: 'pointer', fontSize: '13px', fontWeight: '700', opacity: publishing || selectedVehicles.length === 0 ? 0.5 : 1, textAlign: 'center' }}>
                  {publishing ? '...' : `Add for ${mp.name}`}
                </button>
              ))}
            </div>

            {/* Vehicle Selection */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{selectedVehicles.length} selected</span>
              {(() => {
                const selectable = availableVehicles.filter(v => !listings.some(l => l.inventory_id === v.id && ['active', 'pending'].includes(l.status))).map(v => v.id);
                const allSelected = selectable.length > 0 && selectedVehicles.length === selectable.length;
                return (
                  <button onClick={() => setSelectedVehicles(allSelected ? [] : selectable)} style={{ background: 'none', border: 'none', color: theme.accent, cursor: 'pointer', fontSize: '13px' }}>
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </button>
                );
              })()}
            </div>

            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {availableVehicles.map(v => {
                const alreadyListed = listings.some(l => l.inventory_id === v.id && ['active', 'pending'].includes(l.status));
                return (
                  <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', backgroundColor: selectedVehicles.includes(v.id) ? theme.accentBg : 'transparent', cursor: alreadyListed ? 'default' : 'pointer', opacity: alreadyListed ? 0.5 : 1, marginBottom: '4px' }}>
                    <input type="checkbox" checked={selectedVehicles.includes(v.id)} disabled={alreadyListed} onChange={e => {
                      if (e.target.checked) setSelectedVehicles([...selectedVehicles, v.id]);
                      else setSelectedVehicles(selectedVehicles.filter(id => id !== v.id));
                    }} style={{ accentColor: theme.accent }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: theme.text, fontWeight: '500', fontSize: '14px' }}>{v.year} {v.make} {v.model} {v.trim || ''}</div>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                        {v.stock_number && `#${v.stock_number}`} {(v.miles || v.mileage) ? `• ${Number(v.miles || v.mileage).toLocaleString()} mi` : ''} {v.color && `• ${v.color}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: theme.accent, fontWeight: '700' }}>{vehiclePrice(v) != null ? `$${Number(vehiclePrice(v)).toLocaleString()}` : 'No price'}</div>
                      {alreadyListed && <div style={{ fontSize: '11px', color: '#f59e0b' }}>Already listed</div>}
                    </div>
                  </label>
                );
              })}
              {availableVehicles.length === 0 && <div style={{ color: theme.textMuted, fontSize: '13px', padding: '12px' }}>No cars marked "In Stock" or "For Sale" in Inventory.</div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => { setShowPublishModal(false); setSelectedVehicles([]); }} style={{ padding: '10px 20px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
