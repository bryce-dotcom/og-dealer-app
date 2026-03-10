import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Investment Portfolio</h1>
            <p className="text-blue-200">Track your vehicle investments and returns</p>
          </div>
          <button
            onClick={() => navigate('/investor/dashboard')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Dashboard
          </button>
        </div>

        {/* Pool Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {pools.map((share) => {
            const pool = share.pool;
            const deployedPercent = ((pool.deployed_capital / pool.total_capital) * 100) || 0;

            return (
              <div
                key={share.id}
                className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 border-2 transition cursor-pointer ${
                  selectedPool === pool.id
                    ? 'border-blue-500 shadow-lg shadow-blue-500/30'
                    : 'border-white/20 hover:border-white/40'
                }`}
                onClick={() => setSelectedPool(pool.id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">{pool.pool_name}</h3>
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-semibold">
                    {share.ownership_percentage?.toFixed(2)}% Ownership
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-200">Your Capital:</span>
                    <span className="text-white font-semibold">{formatCurrency(share.capital_invested)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Pool Total:</span>
                    <span className="text-white font-semibold">{formatCurrency(pool.total_capital)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Deployed:</span>
                    <span className="text-amber-400 font-semibold">
                      {formatCurrency(pool.deployed_capital)} ({deployedPercent.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Available:</span>
                    <span className="text-green-400 font-semibold">{formatCurrency(pool.available_capital)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/20">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-xs text-blue-200 mb-1">Your Profit</div>
                      <div className="text-2xl font-bold text-green-400">
                        {formatCurrency(share.total_profit_earned)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-blue-200 mb-1">ROI</div>
                      <div className="text-2xl font-bold text-amber-400">
                        {share.current_roi?.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs text-blue-200">
                  <div className="flex justify-between">
                    <span>Active Vehicles:</span>
                    <span className="text-white font-medium">{vehicles.filter(v => v.pool_id === pool.id && v.status === 'active').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sold (30d):</span>
                    <span className="text-white font-medium">{pool.total_vehicles_sold || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Days to Sell:</span>
                    <span className="text-white font-medium">{pool.avg_days_to_sell?.toFixed(0) || 0} days</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Vehicle Filters */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                All ({vehicles.length})
              </button>
              <button
                onClick={() => setFilter('active')}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  filter === 'active'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Active ({vehicles.filter(v => v.status === 'active').length})
              </button>
              <button
                onClick={() => setFilter('sold')}
                className={`px-6 py-2 rounded-lg font-semibold transition ${
                  filter === 'sold'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                Sold ({vehicles.filter(v => v.status === 'sold').length})
              </button>
            </div>

            <div className="text-blue-200 text-sm">
              Showing {filteredVehicles.length} vehicle{filteredVehicles.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Vehicle Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVehicles.map((vehicle) => {
            const daysHeld = vehicle.days_held || Math.floor((new Date() - new Date(vehicle.purchase_date)) / (1000 * 60 * 60 * 24));
            const actualROI = vehicle.gross_profit ? ((vehicle.gross_profit / vehicle.purchase_price) * 100) : 0;
            const projectedROI = 15; // Mock
            const isSold = vehicle.status === 'sold';

            return (
              <div key={vehicle.id} className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden hover:border-blue-500 transition">
                {/* Image */}
                <div className="aspect-video bg-slate-800 relative">
                  {vehicle.inventory?.photos?.[0] ? (
                    <img
                      src={vehicle.inventory.photos[0]}
                      alt="Vehicle"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      No Photo
                    </div>
                  )}
                  <div className="absolute top-3 right-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      isSold
                        ? 'bg-green-500 text-white'
                        : 'bg-blue-500 text-white'
                    }`}>
                      {isSold ? '✓ SOLD' : 'ON LOT'}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  {/* Title */}
                  <h3 className="text-xl font-bold text-white mb-1">
                    {vehicle.vehicle_info?.year} {vehicle.vehicle_info?.make} {vehicle.vehicle_info?.model}
                  </h3>
                  <p className="text-blue-200 text-sm mb-4">
                    {vehicle.vehicle_info?.trim || 'Base Model'} • Stock #{vehicle.vehicle_info?.stock_number || 'N/A'}
                  </p>

                  {/* Financial Details */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-200">Your Capital:</span>
                      <span className="text-white font-semibold">{formatCurrency(vehicle.capital_deployed)}</span>
                    </div>
                    {isSold ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-200">Sale Price:</span>
                          <span className="text-white font-semibold">{formatCurrency(vehicle.sale_price)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-200">Gross Profit:</span>
                          <span className="text-green-400 font-bold">+{formatCurrency(vehicle.gross_profit)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-200">Your Profit:</span>
                          <span className="text-green-400 font-bold text-lg">
                            +{formatCurrency(vehicle.investor_profit)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-200">Projected Profit:</span>
                        <span className="text-amber-400 font-semibold">
                          ~+{formatCurrency(vehicle.purchase_price * (projectedROI / 100))}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-xs text-blue-200 mb-1">Days {isSold ? 'Held' : 'on Lot'}</div>
                      <div className="text-lg font-bold text-white">{daysHeld}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-xs text-blue-200 mb-1">ROI</div>
                      <div className={`text-lg font-bold ${isSold ? 'text-green-400' : 'text-amber-400'}`}>
                        {isSold ? actualROI.toFixed(1) : `~${projectedROI}`}%
                      </div>
                    </div>
                  </div>

                  {/* Purchase Info */}
                  <div className="pt-3 border-t border-white/20 text-xs text-blue-200">
                    <div className="flex justify-between mb-1">
                      <span>Purchased:</span>
                      <span className="text-white">{new Date(vehicle.purchase_date).toLocaleDateString()}</span>
                    </div>
                    {isSold && (
                      <div className="flex justify-between">
                        <span>Sold:</span>
                        <span className="text-white">{new Date(vehicle.sale_date).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredVehicles.length === 0 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 border border-white/20 text-center">
            <svg className="w-20 h-20 mx-auto mb-4 text-blue-400 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">No {filter === 'all' ? '' : filter} vehicles</h3>
            <p className="text-blue-200">
              {filter === 'active' ? 'All vehicles have been sold' : 'No vehicles in this category yet'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
