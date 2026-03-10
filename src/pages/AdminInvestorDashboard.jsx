import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PlaidLinkButton from '../components/PlaidLinkButton';

export default function AdminInvestorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, investors, transfers, pools, accreditation

  const [stats, setStats] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [pools, setPools] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedPool, setSelectedPool] = useState(null);
  const [accreditationDocs, setAccreditationDocs] = useState([]);

  useEffect(() => {
    loadAdminData();
  }, []);

  async function loadAdminData() {
    try {
      setLoading(true);

      // Check if user is admin (has dealer access)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Load investors
      const { data: investorsData } = await supabase
        .from('investors')
        .select('*')
        .order('created_at', { ascending: false });
      setInvestors(investorsData || []);

      // Load pools
      const { data: poolsData } = await supabase
        .from('investment_pools')
        .select('*')
        .order('created_at', { ascending: false });
      setPools(poolsData || []);
      if (poolsData?.length > 0) {
        setSelectedPool(poolsData[0]);
      }

      // Load recent transfers
      const { data: transfersData } = await supabase
        .from('investor_capital')
        .select(`
          *,
          investors (full_name, email)
        `)
        .order('initiated_at', { ascending: false })
        .limit(50);
      setTransfers(transfersData || []);

      // Load accreditation documents pending review
      const { data: docsData } = await supabase
        .from('investor_documents')
        .select('*, investors(full_name, email)')
        .eq('status', 'pending')
        .order('uploaded_at', { ascending: false });
      setAccreditationDocs(docsData || []);

      // Calculate stats
      const totalInvestors = investorsData?.length || 0;
      const totalCapital = poolsData?.reduce((sum, p) => sum + (parseFloat(p.total_capital) || 0), 0) || 0;
      const deployedCapital = poolsData?.reduce((sum, p) => sum + (parseFloat(p.deployed_capital) || 0), 0) || 0;
      const availableCapital = poolsData?.reduce((sum, p) => sum + (parseFloat(p.available_capital) || 0), 0) || 0;
      const pendingTransfers = transfersData?.filter(t => t.status === 'pending' || t.status === 'processing').length || 0;
      const totalVehiclesFunded = poolsData?.reduce((sum, p) => sum + (p.total_vehicles_funded || 0), 0) || 0;

      setStats({
        totalInvestors,
        totalCapital,
        deployedCapital,
        availableCapital,
        pendingTransfers,
        totalVehiclesFunded
      });

    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncPoolTransactions(poolId) {
    try {
      const { data, error } = await supabase.functions.invoke('plaid-sync-pool-transactions', {
        body: { pool_id: poolId }
      });

      if (error) throw error;

      if (data.success) {
        alert(`✅ Sync complete!\n\nNew: ${data.new_count}\nUpdated: ${data.updated_count}\nBalance: $${data.balance?.toLocaleString()}`);
        loadAdminData();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error syncing transactions:', error);
      alert('Failed to sync: ' + error.message);
    }
  }

  async function handleAccreditationReview(docId, investorId, status, notes = '') {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update document status
      const { error: docError } = await supabase
        .from('investor_documents')
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', docId);

      if (docError) throw docError;

      if (status === 'approved') {
        // Check if all docs for this investor are approved
        const { data: allDocs } = await supabase
          .from('investor_documents')
          .select('status')
          .eq('investor_id', investorId);

        const allApproved = allDocs?.every(d => d.id === docId ? true : d.status === 'approved');

        if (allApproved) {
          // Mark investor as accredited
          const { error: invError } = await supabase
            .from('investors')
            .update({
              accredited_investor: true,
              accreditation_verified: true,
              identity_verified: true,
              accreditation_date: new Date().toISOString().split('T')[0],
            })
            .eq('id', investorId);

          if (invError) throw invError;

          // Send notification
          await supabase.rpc('create_investor_notification', {
            p_investor_id: investorId,
            p_type: 'accreditation_approved',
            p_title: 'Accreditation Approved',
            p_message: 'Your accredited investor status has been verified. You now have full access to all investment features.',
            p_action_url: '/investor/settings',
          });
        }
      } else if (status === 'rejected') {
        await supabase.rpc('create_investor_notification', {
          p_investor_id: investorId,
          p_type: 'accreditation_rejected',
          p_title: 'Document Needs Attention',
          p_message: `A document was rejected: ${notes || 'Please re-upload with valid documentation.'}`,
          p_action_url: '/investor/accreditation',
        });
      }

      alert(`Document ${status}`);
      loadAdminData();
    } catch (error) {
      console.error('Error reviewing document:', error);
      alert('Failed: ' + error.message);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  }

  function getStatusColor(status) {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20';
      case 'processing': return 'text-blue-400 bg-blue-500/20';
      case 'pending': return 'text-amber-400 bg-amber-500/20';
      case 'failed': return 'text-red-400 bg-red-500/20';
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'suspended': return 'text-amber-400 bg-amber-500/20';
      case 'closed': return 'text-slate-400 bg-slate-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Investor Portal Admin</h1>
            <p className="text-slate-400">Manage investors, pools, and capital flows</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Total Investors</div>
            <div className="text-3xl font-bold text-white">{stats?.totalInvestors || 0}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Total Capital</div>
            <div className="text-2xl font-bold text-blue-400">{formatCurrency(stats?.totalCapital)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Deployed</div>
            <div className="text-2xl font-bold text-green-400">{formatCurrency(stats?.deployedCapital)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Available</div>
            <div className="text-2xl font-bold text-amber-400">{formatCurrency(stats?.availableCapital)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Pending Transfers</div>
            <div className="text-3xl font-bold text-amber-400">{stats?.pendingTransfers || 0}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-slate-400 text-sm mb-2">Vehicles Funded</div>
            <div className="text-3xl font-bold text-white">{stats?.totalVehiclesFunded || 0}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-700">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'investors', label: 'Investors' },
            { id: 'transfers', label: 'Transfers' },
            { id: 'pools', label: 'Investment Pools' },
            { id: 'accreditation', label: `Accreditation (${accreditationDocs.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 font-semibold transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Recent Transfers */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Recent Transfers</h2>
              <div className="space-y-2">
                {transfers.slice(0, 10).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <div>
                      <div className="text-white font-medium">
                        {tx.investors?.full_name || 'Unknown'} • {tx.transaction_type}
                      </div>
                      <div className="text-slate-400 text-sm">
                        {new Date(tx.initiated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold">{formatCurrency(tx.amount)}</div>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(tx.status)}`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Pools */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Investment Pools</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pools.map(pool => (
                  <div key={pool.id} className="bg-slate-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold text-white">{pool.pool_name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(pool.status)}`}>
                        {pool.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-slate-400">Total Capital</div>
                        <div className="text-white font-semibold">{formatCurrency(pool.total_capital)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Deployed</div>
                        <div className="text-green-400 font-semibold">{formatCurrency(pool.deployed_capital)}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Available</div>
                        <div className="text-amber-400 font-semibold">{formatCurrency(pool.available_capital)}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-400">
                      <div>Vehicles: {pool.total_vehicles_funded || 0} funded, {pool.total_vehicles_sold || 0} sold</div>
                      <div>ROI: {pool.lifetime_roi?.toFixed(2) || 0}% • Avg Days: {pool.avg_days_to_sell?.toFixed(0) || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Investors Tab */}
        {activeTab === 'investors' && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Investor</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Total Invested</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Total Returned</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Available</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">ROI</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Bank Linked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {investors.map(investor => (
                    <tr key={investor.id} className="hover:bg-slate-700/30">
                      <td className="px-6 py-4 text-white font-medium">{investor.full_name}</td>
                      <td className="px-6 py-4 text-slate-300">{investor.email}</td>
                      <td className="px-6 py-4 text-blue-400 font-semibold">{formatCurrency(investor.total_invested)}</td>
                      <td className="px-6 py-4 text-green-400 font-semibold">{formatCurrency(investor.total_returned)}</td>
                      <td className="px-6 py-4 text-amber-400 font-semibold">{formatCurrency(investor.available_balance)}</td>
                      <td className="px-6 py-4 text-white font-semibold">{investor.lifetime_roi?.toFixed(2) || 0}%</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(investor.status)}`}>
                          {investor.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {investor.linked_bank_account ? (
                          <span className="text-green-400">✓ Linked</span>
                        ) : (
                          <span className="text-slate-400">Not linked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Transfers Tab */}
        {activeTab === 'transfers' && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Date</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Investor</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Amount</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Method</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase">Transfer ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {transfers.map(tx => (
                    <tr key={tx.id} className="hover:bg-slate-700/30">
                      <td className="px-6 py-4 text-slate-300">
                        {new Date(tx.initiated_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-white">{tx.investors?.full_name || 'Unknown'}</td>
                      <td className="px-6 py-4">
                        <span className="capitalize text-slate-300">{tx.transaction_type}</span>
                      </td>
                      <td className="px-6 py-4 text-white font-semibold">{formatCurrency(tx.amount)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getStatusColor(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-300 uppercase text-sm">{tx.payment_method}</td>
                      <td className="px-6 py-4 text-slate-400 text-xs font-mono">
                        {tx.plaid_transfer_id ? tx.plaid_transfer_id.substring(0, 20) + '...' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pools Tab */}
        {activeTab === 'pools' && (
          <div className="space-y-6">
            {pools.map(pool => (
              <div key={pool.id} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{pool.pool_name}</h2>
                    <p className="text-slate-400">{pool.description}</p>
                  </div>
                  <span className={`text-sm px-3 py-1 rounded-full font-semibold ${getStatusColor(pool.status)}`}>
                    {pool.status}
                  </span>
                </div>

                {/* Capital Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Total Capital</div>
                    <div className="text-2xl font-bold text-white">{formatCurrency(pool.total_capital)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Deployed</div>
                    <div className="text-2xl font-bold text-green-400">{formatCurrency(pool.deployed_capital)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Available</div>
                    <div className="text-2xl font-bold text-amber-400">{formatCurrency(pool.available_capital)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Reserved</div>
                    <div className="text-2xl font-bold text-blue-400">{formatCurrency(pool.reserved_capital)}</div>
                  </div>
                </div>

                {/* Performance Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Total Profit</div>
                    <div className="text-xl font-bold text-green-400">{formatCurrency(pool.total_profit)}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Lifetime ROI</div>
                    <div className="text-xl font-bold text-white">{pool.lifetime_roi?.toFixed(2) || 0}%</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Vehicles Funded</div>
                    <div className="text-xl font-bold text-white">{pool.total_vehicles_funded || 0}</div>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="text-slate-400 text-sm mb-1">Avg Days to Sell</div>
                    <div className="text-xl font-bold text-white">{pool.avg_days_to_sell?.toFixed(0) || 0} days</div>
                  </div>
                </div>

                {/* Profit Split */}
                <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
                  <h3 className="text-white font-semibold mb-3">Profit Split Terms</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-slate-400">Investor Share</div>
                      <div className="text-blue-400 font-bold text-lg">{pool.investor_profit_share}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Platform Fee</div>
                      <div className="text-amber-400 font-bold text-lg">{pool.platform_fee_share}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Dealer Share</div>
                      <div className="text-green-400 font-bold text-lg">{pool.dealer_profit_share}%</div>
                    </div>
                  </div>
                </div>

                {/* Bank Account */}
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <h3 className="text-white font-semibold mb-3">Pool Bank Account</h3>
                  {pool.plaid_item_id ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-white font-medium">{pool.bank_account_name || 'Pool Account'}</div>
                          <div className="text-slate-400 text-sm">Connected via Plaid</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSyncPoolTransactions(pool.id)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
                      >
                        Sync Transactions
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-slate-400 mb-4">No bank account linked</div>
                      <PlaidLinkButton
                        investorId="admin"
                        buttonText="Connect Pool Bank Account"
                        onSuccess={() => {
                          alert('Pool bank account connected!');
                          loadAdminData();
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Accreditation Tab */}
        {activeTab === 'accreditation' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Pending Accreditation Reviews</h2>
              {accreditationDocs.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p>No documents pending review</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {accreditationDocs.map(doc => (
                    <div key={doc.id} className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-white font-semibold">{doc.investors?.full_name}</div>
                          <div className="text-slate-400 text-sm">{doc.investors?.email}</div>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full font-semibold text-amber-400 bg-amber-500/20">
                          pending
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <div className="text-white text-sm">{doc.file_name}</div>
                            <div className="text-slate-400 text-xs">
                              {doc.document_type.replace(/_/g, ' ')} | Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                              {doc.file_size ? ` | ${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {doc.file_url && (
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-xs font-semibold transition"
                            >
                              View
                            </a>
                          )}
                          <button
                            onClick={() => handleAccreditationReview(doc.id, doc.investor_id, 'approved')}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const notes = prompt('Rejection reason:');
                              if (notes !== null) handleAccreditationReview(doc.id, doc.investor_id, 'rejected', notes);
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Accredited Investors Summary */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Accreditation Status</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Investor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Accredited</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Verified</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {investors.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-700/30">
                        <td className="px-4 py-3">
                          <div className="text-white font-medium">{inv.full_name}</div>
                          <div className="text-slate-400 text-xs">{inv.email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 capitalize">{inv.accreditation_method || '-'}</td>
                        <td className="px-4 py-3">
                          {inv.accredited_investor ? (
                            <span className="text-green-400 text-sm font-semibold">Yes</span>
                          ) : (
                            <span className="text-slate-500 text-sm">No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {inv.accreditation_verified ? (
                            <span className="text-green-400 text-sm font-semibold">Verified</span>
                          ) : inv.accreditation_method ? (
                            <span className="text-amber-400 text-sm">Pending</span>
                          ) : (
                            <span className="text-slate-500 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-sm">
                          {inv.accreditation_date ? new Date(inv.accreditation_date).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
