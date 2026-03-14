import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import InvestorLayout from '../components/InvestorLayout';

const cardStyle = { backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', marginBottom: 24, overflow: 'hidden' };

export default function InvestorPortfolio() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [investor, setInvestor] = useState(null);
  const [pools, setPools] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'sold'
  const [selectedPool, setSelectedPool] = useState(null);

  useEffect(() => {
    loadPortfolio();
  }, []);

  async function loadPortfolio() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/investor/login');
        return;
      }

      const { data: investorData } = await supabase
        .from('investors')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setInvestor(investorData);

      // Get investor's pools
      const { data: poolShares } = await supabase
        .from('investor_pool_shares')
        .select(`
          *,
          pool:investment_pools(*)
        `)
        .eq('investor_id', investorData.id)
        .eq('active', true);

      setPools(poolShares || []);

      if (poolShares && poolShares.length > 0) {
        setSelectedPool(poolShares[0].pool_id);
        await loadVehicles(poolShares.map(p => p.pool_id));
      }

    } catch (error) {
      console.error('Error loading portfolio:', error);
      alert('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }

  async function loadVehicles(poolIds) {
    const { data } = await supabase
      .from('investor_vehicles')
      .select(`
        *,
        inventory:inventory(year, make, model, photos, vin, stock_number)
      `)
      .in('pool_id', poolIds)
      .order('purchase_date', { ascending: false });

    setVehicles(data || []);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  }

  const filteredVehicles = vehicles.filter(v => {
    if (filter === 'active') return v.status === 'active';
    if (filter === 'sold') return v.status === 'sold';
    return true;
  });

  if (loading) {
    return (
      <InvestorLayout title="Investment Portfolio">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#0f172a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </InvestorLayout>
    );
  }

  return (
    <InvestorLayout title="Investment Portfolio" subtitle="Track your vehicle investments and returns">

      {/* Pool Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24, marginBottom: 32 }}>
        {pools.map((share) => {
          const pool = share.pool;
          const deployedPercent = ((pool.deployed_capital / pool.total_capital) * 100) || 0;
          const isSelected = selectedPool === pool.id;

          return (
            <div
              key={share.id}
              onClick={() => setSelectedPool(pool.id)}
              style={{
                ...cardStyle,
                marginBottom: 0,
                padding: 24,
                cursor: 'pointer',
                border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                boxShadow: isSelected ? '0 4px 12px rgba(59,130,246,0.15)' : cardStyle.boxShadow,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>{pool.pool_name}</h3>
                <span style={{ padding: '4px 10px', backgroundColor: '#ecfdf5', color: '#059669', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                  {share.ownership_percentage?.toFixed(2)}% Ownership
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Your Capital:</span>
                  <span style={{ color: '#111827', fontWeight: 600 }}>{formatCurrency(share.capital_invested)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Pool Total:</span>
                  <span style={{ color: '#111827', fontWeight: 600 }}>{formatCurrency(pool.total_capital)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Deployed:</span>
                  <span style={{ color: '#d97706', fontWeight: 600 }}>
                    {formatCurrency(pool.deployed_capital)} ({deployedPercent.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Available:</span>
                  <span style={{ color: '#059669', fontWeight: 600 }}>{formatCurrency(pool.available_capital)}</span>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Your Profit</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>
                    {formatCurrency(share.total_profit_earned)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>ROI</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>
                    {share.current_roi?.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#6b7280' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Active Vehicles:</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{vehicles.filter(v => v.pool_id === pool.id && v.status === 'active').length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Sold (30d):</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{pool.total_vehicles_sold || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Avg Days to Sell:</span>
                  <span style={{ color: '#111827', fontWeight: 500 }}>{pool.avg_days_to_sell?.toFixed(0) || 0} days</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vehicle Filters */}
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { key: 'all', label: `All (${vehicles.length})` },
              { key: 'active', label: `Active (${vehicles.filter(v => v.status === 'active').length})` },
              { key: 'sold', label: `Sold (${vehicles.filter(v => v.status === 'sold').length})` },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  backgroundColor: filter === f.key ? '#111827' : '#f3f4f6',
                  color: filter === f.key ? '#fff' : '#4b5563',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ color: '#6b7280', fontSize: 14 }}>
            Showing {filteredVehicles.length} vehicle{filteredVehicles.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Vehicle Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {filteredVehicles.map((vehicle) => {
          const daysHeld = vehicle.days_held || Math.floor((new Date() - new Date(vehicle.purchase_date)) / (1000 * 60 * 60 * 24));
          const actualROI = vehicle.gross_profit ? ((vehicle.gross_profit / vehicle.purchase_price) * 100) : 0;
          const projectedROI = 15;
          const isSold = vehicle.status === 'sold';

          return (
            <div key={vehicle.id} style={cardStyle}>
              {/* Image */}
              <div style={{ aspectRatio: '16/9', backgroundColor: '#f3f4f6', position: 'relative' }}>
                {vehicle.inventory?.photos?.[0] ? (
                  <img
                    src={vehicle.inventory.photos[0]}
                    alt="Vehicle"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                    No Photo
                  </div>
                )}
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <span style={{
                    padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                    backgroundColor: isSold ? '#059669' : '#3b82f6', color: '#fff',
                  }}>
                    {isSold ? 'SOLD' : 'ON LOT'}
                  </span>
                </div>
              </div>

              <div style={{ padding: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                  {vehicle.vehicle_info?.year} {vehicle.vehicle_info?.make} {vehicle.vehicle_info?.model}
                </h3>
                <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px' }}>
                  {vehicle.vehicle_info?.trim || 'Base Model'} &bull; Stock #{vehicle.vehicle_info?.stock_number || 'N/A'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#6b7280' }}>Your Capital:</span>
                    <span style={{ color: '#111827', fontWeight: 600 }}>{formatCurrency(vehicle.capital_deployed)}</span>
                  </div>
                  {isSold ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ color: '#6b7280' }}>Sale Price:</span>
                        <span style={{ color: '#111827', fontWeight: 600 }}>{formatCurrency(vehicle.sale_price)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ color: '#6b7280' }}>Gross Profit:</span>
                        <span style={{ color: '#059669', fontWeight: 700 }}>+{formatCurrency(vehicle.gross_profit)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ color: '#6b7280' }}>Your Profit:</span>
                        <span style={{ color: '#059669', fontWeight: 700, fontSize: 18 }}>
                          +{formatCurrency(vehicle.investor_profit)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                      <span style={{ color: '#6b7280' }}>Projected Profit:</span>
                      <span style={{ color: '#d97706', fontWeight: 600 }}>
                        ~+{formatCurrency(vehicle.purchase_price * (projectedROI / 100))}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Days {isSold ? 'Held' : 'on Lot'}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{daysHeld}</div>
                  </div>
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>ROI</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: isSold ? '#059669' : '#d97706' }}>
                      {isSold ? actualROI.toFixed(1) : `~${projectedROI}`}%
                    </div>
                  </div>
                </div>

                <div style={{ paddingTop: 12, borderTop: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Purchased:</span>
                    <span style={{ color: '#111827' }}>{new Date(vehicle.purchase_date).toLocaleDateString()}</span>
                  </div>
                  {isSold && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Sold:</span>
                      <span style={{ color: '#111827' }}>{new Date(vehicle.sale_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredVehicles.length === 0 && (
        <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
          <svg style={{ width: 80, height: 80, margin: '0 auto 16px', color: '#9ca3af', opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>No {filter === 'all' ? '' : filter} vehicles</h3>
          <p style={{ color: '#6b7280' }}>
            {filter === 'active' ? 'All vehicles have been sold' : 'No vehicles in this category yet'}
          </p>
        </div>
      )}

    </InvestorLayout>
  );
}
