import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PlaidLinkButton from '../components/PlaidLinkButton';

export default function AdminInvestorDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const [stats, setStats] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [pools, setPools] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedPool, setSelectedPool] = useState(null);
  const [accreditationDocs, setAccreditationDocs] = useState([]);

  // Invite form state
  const [inviteForm, setInviteForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    pool_id: '',
    investor_profit_share: '',
    platform_fee_share: '',
    dealer_profit_share: '',
    min_investment: '',
    notes: '',
  });
  const [showPreview, setShowPreview] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Create Pool form state
  const [poolForm, setPoolForm] = useState({
    pool_name: '',
    pool_type: 'merchant_rate',
    description: '',
    investor_profit_share: 3,
    platform_fee_share: 0,
    dealer_profit_share: 0,
    annual_return_rate: 8.5,
    payout_frequency: 'quarterly',
    min_investment: 10000,
    max_investment: '',
  });
  const [creatingPool, setCreatingPool] = useState(false);
  const [showCreatePool, setShowCreatePool] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, []);

  // When a pool is selected in the invite form, pre-fill its terms
  useEffect(() => {
    if (inviteForm.pool_id) {
      const pool = pools.find(p => p.id === inviteForm.pool_id);
      if (pool) {
        setInviteForm(prev => ({
          ...prev,
          investor_profit_share: pool.investor_profit_share ?? 60,
          platform_fee_share: pool.platform_fee_share ?? 20,
          dealer_profit_share: pool.dealer_profit_share ?? 20,
          min_investment: pool.min_investment ?? 10000,
        }));
      }
    }
  }, [inviteForm.pool_id, pools]);

  async function loadAdminData() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const { data: investorsData } = await supabase
        .from('investors')
        .select('*')
        .order('created_at', { ascending: false });
      setInvestors(investorsData || []);

      const { data: poolsData } = await supabase
        .from('investment_pools')
        .select('*')
        .order('created_at', { ascending: false });
      setPools(poolsData || []);
      if (poolsData?.length > 0) {
        setSelectedPool(poolsData[0]);
      }

      const { data: transfersData } = await supabase
        .from('investor_capital')
        .select(`
          *,
          investors (full_name, email)
        `)
        .order('initiated_at', { ascending: false })
        .limit(50);
      setTransfers(transfersData || []);

      const { data: docsData } = await supabase
        .from('investor_documents')
        .select('*, investors(full_name, email)')
        .eq('status', 'pending')
        .order('uploaded_at', { ascending: false });
      setAccreditationDocs(docsData || []);

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
        alert(`Sync complete!\n\nNew: ${data.new_count}\nUpdated: ${data.updated_count}\nBalance: $${data.balance?.toLocaleString()}`);
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
        const { data: allDocs } = await supabase
          .from('investor_documents')
          .select('status')
          .eq('investor_id', investorId);

        const allApproved = allDocs?.every(d => d.id === docId ? true : d.status === 'approved');

        if (allApproved) {
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

  async function handleCreatePool() {
    if (!poolForm.pool_name) {
      alert('Please enter a pool name.');
      return;
    }

    try {
      setCreatingPool(true);

      const insertData = {
        pool_name: poolForm.pool_name,
        pool_type: poolForm.pool_type,
        description: poolForm.description || null,
        min_investment: Number(poolForm.min_investment) || 10000,
        max_investment: poolForm.max_investment ? Number(poolForm.max_investment) : null,
      };

      if (poolForm.pool_type === 'merchant_rate') {
        insertData.investor_profit_share = Number(poolForm.investor_profit_share) || 3;
        insertData.platform_fee_share = 0;
        insertData.dealer_profit_share = 0;
        insertData.annual_return_rate = null;
        insertData.payout_frequency = null;
      } else if (poolForm.pool_type === 'profit_share') {
        insertData.investor_profit_share = Number(poolForm.investor_profit_share) || 60;
        insertData.platform_fee_share = Number(poolForm.platform_fee_share) || 20;
        insertData.dealer_profit_share = Number(poolForm.dealer_profit_share) || 20;
        insertData.annual_return_rate = null;
        insertData.payout_frequency = null;
      } else {
        insertData.annual_return_rate = Number(poolForm.annual_return_rate) || 8.5;
        insertData.payout_frequency = poolForm.payout_frequency || 'quarterly';
        insertData.investor_profit_share = 0;
        insertData.platform_fee_share = 0;
        insertData.dealer_profit_share = 0;
      }

      const { error } = await supabase
        .from('investment_pools')
        .insert(insertData);

      if (error) throw error;

      alert('Pool created successfully!');
      setShowCreatePool(false);
      setPoolForm({
        pool_name: '',
        pool_type: 'merchant_rate',
        description: '',
        investor_profit_share: 3,
        platform_fee_share: 0,
        dealer_profit_share: 0,
        annual_return_rate: 8.5,
        payout_frequency: 'quarterly',
        min_investment: 10000,
        max_investment: '',
      });
      loadAdminData();
    } catch (error) {
      console.error('Error creating pool:', error);
      alert('Failed to create pool: ' + error.message);
    } finally {
      setCreatingPool(false);
    }
  }

  async function handleSendInvite() {
    if (!inviteForm.full_name || !inviteForm.email) {
      alert('Please enter at least a name and email.');
      return;
    }

    try {
      setInviteSending(true);
      const inviteToken = crypto.randomUUID();

      const selectedPool = inviteForm.pool_id ? pools.find(p => p.id === inviteForm.pool_id) : null;
      const poolType = selectedPool?.pool_type || 'profit_share';

      const customTerms = {
        pool_type: poolType,
        min_investment: Number(inviteForm.min_investment) || 10000,
      };

      if (poolType === 'profit_share') {
        customTerms.investor_profit_share = Number(inviteForm.investor_profit_share) || 60;
        customTerms.platform_fee_share = Number(inviteForm.platform_fee_share) || 20;
        customTerms.dealer_profit_share = Number(inviteForm.dealer_profit_share) || 20;
      } else {
        customTerms.annual_return_rate = selectedPool?.annual_return_rate || 0;
        customTerms.payout_frequency = selectedPool?.payout_frequency || 'quarterly';
      }

      const inviteNotes = JSON.stringify({
        invite_token: inviteToken,
        pool_id: inviteForm.pool_id || null,
        custom_terms: customTerms,
        special_notes: inviteForm.notes || '',
        invited_at: new Date().toISOString(),
      });

      const { error } = await supabase
        .from('investors')
        .insert({
          email: inviteForm.email,
          full_name: inviteForm.full_name,
          phone: inviteForm.phone || null,
          status: 'invited',
          notes: inviteNotes,
        });

      if (error) throw error;

      // If a pool was selected, we'll link them after they sign up
      const link = `${window.location.origin}/investor/login?invite=${inviteToken}`;
      setInviteLink(link);
      setShowPreview(false);

      // Send invite email via edge function
      try {
        const { data: fnData, error: fnError } = await supabase.functions.invoke('send-investor-notification', {
          body: {
            investor_id: null, // We don't have the ID yet, pass email directly
            notification_type: 'invite',
            data: {
              email: inviteForm.email,
              full_name: inviteForm.full_name,
              invite_link: link,
              pool_name: selectedPool?.name || 'Investment Pool',
              pool_type: poolType,
              rate: poolType === 'profit_share'
                ? (Number(inviteForm.investor_profit_share) || 60)
                : (selectedPool?.annual_return_rate || 0),
              payout_frequency: selectedPool?.payout_frequency || 'quarterly',
              min_investment: Number(inviteForm.min_investment) || 10000,
            },
          },
        });
        if (fnError) console.error('Email send error:', fnError);
      } catch (emailErr) {
        console.error('Failed to send invite email:', emailErr);
        // Don't block the flow - invite was created, email is best-effort
      }

      // Reload data
      loadAdminData();
    } catch (error) {
      console.error('Error sending invite:', error);
      alert('Failed to create invite: ' + error.message);
    } finally {
      setInviteSending(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(inviteLink);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  function resetInviteForm() {
    setInviteForm({
      full_name: '',
      email: '',
      phone: '',
      pool_id: '',
      investor_profit_share: '',
      platform_fee_share: '',
      dealer_profit_share: '',
      min_investment: '',
      notes: '',
    });
    setShowPreview(false);
    setInviteLink('');
    setInviteCopied(false);
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
      case 'invited': return 'text-purple-400 bg-purple-500/20';
      case 'suspended': return 'text-amber-400 bg-amber-500/20';
      case 'closed': return 'text-slate-400 bg-slate-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  }

  function getPoolTypeBadge(poolType) {
    if (poolType === 'fixed_return') return 'text-emerald-400 bg-emerald-500/20';
    if (poolType === 'merchant_rate') return 'text-orange-400 bg-orange-500/20';
    return 'text-violet-400 bg-violet-500/20';
  }

  function getPoolTypeLabel(poolType) {
    if (poolType === 'fixed_return') return 'Fixed Return';
    if (poolType === 'merchant_rate') return 'Merchant Rate';
    return 'Profit Share';
  }

  function getPayoutLabel(freq) {
    switch (freq) {
      case 'monthly': return 'Monthly';
      case 'quarterly': return 'Quarterly';
      case 'annually': return 'Annually';
      default: return freq || 'N/A';
    }
  }

  function calcFixedReturnPreview(investment, rate, frequency) {
    const inv = Number(investment) || 10000;
    const r = Number(rate) || 0;
    const annual = inv * (r / 100);
    let per = annual;
    let label = 'year';
    if (frequency === 'monthly') { per = annual / 12; label = 'month'; }
    else if (frequency === 'quarterly') { per = annual / 4; label = 'quarter'; }
    else { label = 'year'; }
    return { annual, per, label };
  }

  function getSelectedPoolForPreview() {
    if (!inviteForm.pool_id) return null;
    return pools.find(p => p.id === inviteForm.pool_id) || null;
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
            &larr; Back to Dashboard
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
        <div className="flex gap-2 mb-6 border-b border-slate-700 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'invite', label: 'Invite Investor', highlight: true },
            { id: 'investors', label: 'Investors' },
            { id: 'transfers', label: 'Transfers' },
            { id: 'pools', label: 'Investment Pools' },
            { id: 'accreditation', label: `Accreditation (${accreditationDocs.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 font-semibold transition border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? tab.highlight ? 'border-green-500 text-green-400' : 'border-blue-500 text-blue-400'
                  : tab.highlight ? 'border-transparent text-green-400/60 hover:text-green-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.highlight && (
                <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Recent Transfers</h2>
              <div className="space-y-2">
                {transfers.slice(0, 10).map(tx => (
                  <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                    <div>
                      <div className="text-white font-medium">
                        {tx.investors?.full_name || 'Unknown'} &bull; {tx.transaction_type}
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

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4">Investment Pools</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pools.map(pool => (
                  <div key={pool.id} className="bg-slate-700/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-white">{pool.pool_name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getPoolTypeBadge(pool.pool_type)}`}>
                          {getPoolTypeLabel(pool.pool_type)}
                        </span>
                      </div>
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
                      {pool.pool_type === 'fixed_return' ? (
                        <div>Rate: {pool.annual_return_rate}% annually | Payout: {getPayoutLabel(pool.payout_frequency)}</div>
                      ) : (
                        <div>Split: {pool.investor_profit_share}/{pool.platform_fee_share}/{pool.dealer_profit_share} (Investor/Platform/Dealer)</div>
                      )}
                      <div>Vehicles: {pool.total_vehicles_funded || 0} funded, {pool.total_vehicles_sold || 0} sold</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Invite Investor Tab */}
        {activeTab === 'invite' && (
          <div className="max-w-4xl mx-auto">
            {inviteLink ? (
              /* Success state - show the invite link */
              <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Invite Created!</h2>
                <p className="text-slate-400 mb-6">
                  An investor record for <span className="text-white font-semibold">{inviteForm.full_name}</span> has been created.
                  Share the link below to get them started.
                </p>

                <div className="bg-slate-900 rounded-lg p-4 mb-6 flex items-center gap-3">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="flex-1 bg-transparent text-blue-400 text-sm font-mono outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition whitespace-nowrap ${
                      inviteCopied
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {inviteCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>

                <div className="bg-slate-700/30 rounded-lg p-4 mb-6 text-left">
                  <h3 className="text-white font-semibold mb-2 text-sm">What happens next:</h3>
                  <ol className="text-slate-400 text-sm space-y-1.5 list-decimal list-inside">
                    <li>Share this link with {inviteForm.full_name} via text, email, or in person</li>
                    <li>They will see a welcome page explaining the investment opportunity</li>
                    <li>They create an account (email is pre-filled)</li>
                    <li>They link their bank account and fund their investment</li>
                  </ol>
                </div>

                <button
                  onClick={resetInviteForm}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
                >
                  Invite Another Investor
                </button>
              </div>
            ) : showPreview ? (
              /* Preview of what the investor will see */
              <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold text-white">Preview: What the Investor Will See</h2>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition"
                  >
                    &larr; Back to Form
                  </button>
                </div>

                {/* Mock investor welcome page */}
                <div className="bg-gradient-to-br from-slate-900 via-blue-900/50 to-slate-900 rounded-2xl border border-blue-500/30 overflow-hidden">
                  <div className="p-8 text-center border-b border-blue-500/20">
                    <div className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-3">You've been invited</div>
                    <h1 className="text-3xl font-bold text-white mb-2">
                      Invest with OG DiX Motor Club
                    </h1>
                    <p className="text-blue-200 text-lg max-w-lg mx-auto">
                      Think of it like opening a joint bank account - you fund it, we buy and sell vehicles, you earn profit.
                    </p>
                  </div>

                  <div className="p-8">
                    {/* Steps */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <div className="text-center p-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                          <span className="text-blue-400 font-bold text-lg">1</span>
                        </div>
                        <h3 className="text-white font-semibold mb-1">Create Account</h3>
                        <p className="text-slate-400 text-sm">Sign up in 30 seconds with your email</p>
                      </div>
                      <div className="text-center p-4">
                        <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                          <span className="text-blue-400 font-bold text-lg">2</span>
                        </div>
                        <h3 className="text-white font-semibold mb-1">Link Bank & Fund</h3>
                        <p className="text-slate-400 text-sm">Securely connect your bank and transfer funds</p>
                      </div>
                      <div className="text-center p-4">
                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                          <span className="text-green-400 font-bold text-lg">3</span>
                        </div>
                        <h3 className="text-white font-semibold mb-1">Watch It Grow</h3>
                        <p className="text-slate-400 text-sm">Track your returns in real-time on your dashboard</p>
                      </div>
                    </div>

                    {/* Terms - adapt based on pool type */}
                    {(() => {
                      const previewPool = getSelectedPoolForPreview();
                      const pType = previewPool?.pool_type || 'merchant_rate';

                      if (pType === 'merchant_rate') {
                        const rate = previewPool?.investor_profit_share || inviteForm.investor_profit_share || 3;
                        return (
                          <div className="bg-slate-800/80 rounded-xl p-6 border border-slate-700">
                            <div className="flex items-center gap-2 mb-4">
                              <h3 className="text-white font-bold text-lg">Your Investment Terms</h3>
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-orange-400 bg-orange-500/20">Merchant Rate</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                              <div>
                                <div className="text-slate-400 text-sm">Per Transaction Rate</div>
                                <div className="text-2xl font-bold text-orange-400">{rate}%</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-sm">Example on $15,000</div>
                                <div className="text-2xl font-bold text-green-400">+${((15000 * rate) / 100).toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-sm">Min. Investment</div>
                                <div className="text-2xl font-bold text-white">{formatCurrency(inviteForm.min_investment || 10000)}</div>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-700 text-sm text-slate-400">
                              You earn {rate}% every time your capital is used for a transaction. Like a merchant fee, but you're the one getting paid.
                            </div>
                          </div>
                        );
                      }

                      if (pType === 'fixed_return') {
                        const preview = calcFixedReturnPreview(
                          inviteForm.min_investment || 10000,
                          previewPool?.annual_return_rate || 0,
                          previewPool?.payout_frequency || 'quarterly'
                        );
                        return (
                          <div className="bg-slate-800/80 rounded-xl p-6 border border-slate-700">
                            <div className="flex items-center gap-2 mb-4">
                              <h3 className="text-white font-bold text-lg">Your Investment Terms</h3>
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-emerald-400 bg-emerald-500/20">Fixed Return</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div>
                                <div className="text-slate-400 text-sm">Annual Return</div>
                                <div className="text-2xl font-bold text-emerald-400">{previewPool?.annual_return_rate || 0}%</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-sm">Payout Schedule</div>
                                <div className="text-2xl font-bold text-blue-400">{getPayoutLabel(previewPool?.payout_frequency)}</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-sm">Per {preview.label}</div>
                                <div className="text-2xl font-bold text-green-400">{formatCurrency(preview.per)}</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-sm">Min. Investment</div>
                                <div className="text-2xl font-bold text-white">{formatCurrency(inviteForm.min_investment || 10000)}</div>
                              </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-700 text-sm text-slate-400">
                              {formatCurrency(inviteForm.min_investment || 10000)} invested = {formatCurrency(preview.annual)}/year = {formatCurrency(preview.per)}/{preview.label}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="bg-slate-800/80 rounded-xl p-6 border border-slate-700">
                          <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-white font-bold text-lg">Your Investment Terms</h3>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-violet-400 bg-violet-500/20">Profit Share</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-slate-400 text-sm">Your Profit Share</div>
                              <div className="text-2xl font-bold text-blue-400">{inviteForm.investor_profit_share || 60}%</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm">Platform Fee</div>
                              <div className="text-2xl font-bold text-amber-400">{inviteForm.platform_fee_share || 20}%</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm">Dealer Share</div>
                              <div className="text-2xl font-bold text-green-400">{inviteForm.dealer_profit_share || 20}%</div>
                            </div>
                            <div>
                              <div className="text-slate-400 text-sm">Min. Investment</div>
                              <div className="text-2xl font-bold text-white">{formatCurrency(inviteForm.min_investment || 10000)}</div>
                            </div>
                          </div>
                          {previewPool && (
                            <div className="mt-4 pt-4 border-t border-slate-700">
                              <div className="text-slate-400 text-sm">Investment Pool</div>
                              <div className="text-white font-semibold">{previewPool.pool_name}</div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Send button */}
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowPreview(false)}
                    className="flex-1 px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
                  >
                    Edit Invite
                  </button>
                  <button
                    onClick={handleSendInvite}
                    disabled={inviteSending}
                    className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition"
                  >
                    {inviteSending ? 'Creating Invite...' : 'Send Invite'}
                  </button>
                </div>
              </div>
            ) : (
              /* Invite form */
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-700">
                  <h2 className="text-2xl font-bold text-white mb-1">Invite a New Investor</h2>
                  <p className="text-slate-400">Set up an investor profile and generate a unique invite link they can use to sign up.</p>
                </div>

                <div className="p-6 space-y-6">
                  {/* Contact Info */}
                  <div>
                    <h3 className="text-white font-semibold mb-4 text-lg">Contact Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-300 text-sm font-semibold mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={inviteForm.full_name}
                          onChange={e => setInviteForm(prev => ({ ...prev, full_name: e.target.value }))}
                          placeholder="John Smith"
                          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm font-semibold mb-2">Email *</label>
                        <input
                          type="email"
                          value={inviteForm.email}
                          onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="investor@example.com"
                          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm font-semibold mb-2">Phone (optional)</label>
                        <input
                          type="tel"
                          value={inviteForm.phone}
                          onChange={e => setInviteForm(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="(555) 123-4567"
                          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm font-semibold mb-2">Investment Pool</label>
                        <select
                          value={inviteForm.pool_id}
                          onChange={e => setInviteForm(prev => ({ ...prev, pool_id: e.target.value }))}
                          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                        >
                          <option value="">Select a pool...</option>
                          {pools.map(pool => (
                            <option key={pool.id} value={pool.id}>
                              {pool.pool_name} ({getPoolTypeLabel(pool.pool_type)}) - {pool.status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Pool type indicator */}
                  {inviteForm.pool_id && (() => {
                    const selPool = pools.find(p => p.id === inviteForm.pool_id);
                    if (!selPool) return null;
                    return (
                      <div className={`rounded-lg p-4 border ${
                        selPool.pool_type === 'fixed_return'
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-violet-500/10 border-violet-500/30'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getPoolTypeBadge(selPool.pool_type)}`}>
                            {getPoolTypeLabel(selPool.pool_type)}
                          </span>
                          <span className="text-white font-semibold text-sm">{selPool.pool_name}</span>
                        </div>
                        {selPool.pool_type === 'fixed_return' ? (
                          <p className="text-slate-300 text-sm">
                            This pool pays a fixed {selPool.annual_return_rate}% annual return, distributed {getPayoutLabel(selPool.payout_frequency).toLowerCase()}.
                          </p>
                        ) : selPool.pool_type === 'merchant_rate' ? (
                          <p className="text-slate-300 text-sm">
                            This pool pays <span className="text-orange-400 font-bold">{selPool.investor_profit_share}%</span> per transaction automatically when capital is used.
                          </p>
                        ) : (
                          <p className="text-slate-300 text-sm">
                            This pool uses a profit-share model: {selPool.investor_profit_share}% investor / {selPool.platform_fee_share}% platform / {selPool.dealer_profit_share}% dealer.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Custom Terms - only show profit share fields for profit_share pools */}
                  {(() => {
                    const selPool = inviteForm.pool_id ? pools.find(p => p.id === inviteForm.pool_id) : null;
                    const pType = selPool?.pool_type || 'merchant_rate';

                    if (pType === 'merchant_rate') {
                      return (
                        <div>
                          <h3 className="text-white font-semibold mb-4 text-lg">Merchant Rate Terms</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="bg-slate-700/50 rounded-lg p-4">
                              <div className="text-slate-400 text-sm mb-1">Rate Per Transaction</div>
                              <div className="text-2xl font-bold text-orange-400">{selPool?.investor_profit_share || 3}%</div>
                              <div className="text-slate-400 text-xs mt-1">Earned automatically on every transaction</div>
                            </div>
                            <div>
                              <label className="block text-slate-300 text-sm font-semibold mb-2">Min Investment ($)</label>
                              <input
                                type="number"
                                value={inviteForm.min_investment}
                                onChange={e => setInviteForm(prev => ({ ...prev, min_investment: e.target.value }))}
                                placeholder="10000"
                                min="0"
                                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                              />
                            </div>
                          </div>
                          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-sm">
                            <div className="text-orange-300 font-semibold mb-1">Example</div>
                            <div className="text-slate-300">
                              Dealer uses ${(inviteForm.min_investment || 10000).toLocaleString()} to buy a vehicle → Investor earns <span className="text-green-400 font-bold">${((Number(inviteForm.min_investment || 10000) * (selPool?.investor_profit_share || 3)) / 100).toLocaleString()}</span> automatically
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (pType === 'fixed_return') {
                      // Fixed return pools: show read-only rate info + min investment override
                      const preview = calcFixedReturnPreview(
                        inviteForm.min_investment || selPool?.min_investment || 10000,
                        selPool?.annual_return_rate || 0,
                        selPool?.payout_frequency || 'quarterly'
                      );
                      return (
                        <div>
                          <h3 className="text-white font-semibold mb-4 text-lg">Fixed Return Terms</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div className="bg-slate-700/50 rounded-lg p-4">
                              <div className="text-slate-400 text-sm mb-1">Annual Return Rate</div>
                              <div className="text-2xl font-bold text-emerald-400">{selPool?.annual_return_rate || 0}%</div>
                            </div>
                            <div className="bg-slate-700/50 rounded-lg p-4">
                              <div className="text-slate-400 text-sm mb-1">Payout Frequency</div>
                              <div className="text-2xl font-bold text-blue-400">{getPayoutLabel(selPool?.payout_frequency)}</div>
                            </div>
                            <div>
                              <label className="block text-slate-300 text-sm font-semibold mb-2">Min Investment ($)</label>
                              <input
                                type="number"
                                value={inviteForm.min_investment}
                                onChange={e => setInviteForm(prev => ({ ...prev, min_investment: e.target.value }))}
                                placeholder="10000"
                                min="0"
                                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                              />
                            </div>
                          </div>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-sm">
                            <div className="text-emerald-300 font-semibold mb-1">Investor Earnings Preview</div>
                            <div className="text-slate-300">
                              {formatCurrency(inviteForm.min_investment || selPool?.min_investment || 10000)} invested = {formatCurrency(preview.annual)}/year = {formatCurrency(preview.per)}/{preview.label}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Profit share pool or no pool selected
                    return (
                      <div>
                        <h3 className="text-white font-semibold mb-4 text-lg">Custom Terms</h3>
                        <p className="text-slate-400 text-sm mb-4">
                          These are pre-filled from the selected pool defaults. Adjust as needed for this investor.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-slate-300 text-sm font-semibold mb-2">Investor Profit %</label>
                            <input
                              type="number"
                              value={inviteForm.investor_profit_share}
                              onChange={e => setInviteForm(prev => ({ ...prev, investor_profit_share: e.target.value }))}
                              placeholder="60"
                              min="0"
                              max="100"
                              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-300 text-sm font-semibold mb-2">Platform Fee %</label>
                            <input
                              type="number"
                              value={inviteForm.platform_fee_share}
                              onChange={e => setInviteForm(prev => ({ ...prev, platform_fee_share: e.target.value }))}
                              placeholder="20"
                              min="0"
                              max="100"
                              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-300 text-sm font-semibold mb-2">Dealer Share %</label>
                            <input
                              type="number"
                              value={inviteForm.dealer_profit_share}
                              onChange={e => setInviteForm(prev => ({ ...prev, dealer_profit_share: e.target.value }))}
                              placeholder="20"
                              min="0"
                              max="100"
                              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-300 text-sm font-semibold mb-2">Min Investment ($)</label>
                            <input
                              type="number"
                              value={inviteForm.min_investment}
                              onChange={e => setInviteForm(prev => ({ ...prev, min_investment: e.target.value }))}
                              placeholder="10000"
                              min="0"
                              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                            />
                          </div>
                        </div>

                        {/* Percentage validation */}
                        {(Number(inviteForm.investor_profit_share || 0) + Number(inviteForm.platform_fee_share || 0) + Number(inviteForm.dealer_profit_share || 0)) !== 100 &&
                          inviteForm.investor_profit_share !== '' && (
                          <div className="mt-3 text-amber-400 text-sm">
                            Note: Profit shares total {Number(inviteForm.investor_profit_share || 0) + Number(inviteForm.platform_fee_share || 0) + Number(inviteForm.dealer_profit_share || 0)}% (should be 100%)
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Notes */}
                  <div>
                    <label className="block text-slate-300 text-sm font-semibold mb-2">Notes / Special Terms</label>
                    <textarea
                      value={inviteForm.notes}
                      onChange={e => setInviteForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Any special terms, agreements, or notes about this investor..."
                      rows={3}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none resize-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-4 pt-4 border-t border-slate-700">
                    <button
                      onClick={() => {
                        if (!inviteForm.full_name || !inviteForm.email) {
                          alert('Please enter at least a name and email.');
                          return;
                        }
                        setShowPreview(true);
                      }}
                      className="flex-1 px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
                    >
                      Preview Invite
                    </button>
                    <button
                      onClick={handleSendInvite}
                      disabled={inviteSending || !inviteForm.full_name || !inviteForm.email}
                      className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition"
                    >
                      {inviteSending ? 'Creating...' : 'Send Invite'}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                          <span className="text-green-400">Linked</span>
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
            {/* Create Pool Button / Form */}
            {showCreatePool ? (
              <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                <div className="p-6 border-b border-slate-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Create New Pool</h2>
                    <p className="text-slate-400">Set up a new investment pool for your investors.</p>
                  </div>
                  <button
                    onClick={() => setShowCreatePool(false)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold transition"
                  >
                    Cancel
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Pool Name and Description */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 text-sm font-semibold mb-2">Pool Name *</label>
                      <input
                        type="text"
                        value={poolForm.pool_name}
                        onChange={e => setPoolForm(prev => ({ ...prev, pool_name: e.target.value }))}
                        placeholder="e.g. Growth Fund Q1 2026"
                        className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 text-sm font-semibold mb-2">Description</label>
                      <input
                        type="text"
                        value={poolForm.description}
                        onChange={e => setPoolForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Brief description of this pool..."
                        className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                      />
                    </div>
                  </div>

                  {/* Pool Type Toggle */}
                  <div>
                    <label className="block text-slate-300 text-sm font-semibold mb-3">Pool Type</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <button
                        onClick={() => setPoolForm(prev => ({ ...prev, pool_type: 'merchant_rate', investor_profit_share: 3, platform_fee_share: 0, dealer_profit_share: 0 }))}
                        className={`px-5 py-4 rounded-xl border-2 transition font-semibold text-left ${
                          poolForm.pool_type === 'merchant_rate'
                            ? 'border-orange-500 bg-orange-500/10 text-white'
                            : 'border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            poolForm.pool_type === 'merchant_rate' ? 'border-orange-400' : 'border-slate-500'
                          }`}>
                            {poolForm.pool_type === 'merchant_rate' && <div className="w-2 h-2 rounded-full bg-orange-400"></div>}
                          </div>
                          <span className="font-bold">Merchant Rate</span>
                        </div>
                        <p className="text-xs text-slate-400 ml-6">Flat % earned per transaction when their capital is used</p>
                      </button>
                      <button
                        onClick={() => setPoolForm(prev => ({ ...prev, pool_type: 'profit_share', investor_profit_share: 60, platform_fee_share: 20, dealer_profit_share: 20 }))}
                        className={`px-5 py-4 rounded-xl border-2 transition font-semibold text-left ${
                          poolForm.pool_type === 'profit_share'
                            ? 'border-violet-500 bg-violet-500/10 text-white'
                            : 'border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            poolForm.pool_type === 'profit_share' ? 'border-violet-400' : 'border-slate-500'
                          }`}>
                            {poolForm.pool_type === 'profit_share' && <div className="w-2 h-2 rounded-full bg-violet-400"></div>}
                          </div>
                          <span className="font-bold">Profit Share</span>
                        </div>
                        <p className="text-xs text-slate-400 ml-6">Split vehicle transaction profit between investor, platform & dealer</p>
                      </button>
                      <button
                        onClick={() => setPoolForm(prev => ({ ...prev, pool_type: 'fixed_return' }))}
                        className={`px-5 py-4 rounded-xl border-2 transition font-semibold text-left ${
                          poolForm.pool_type === 'fixed_return'
                            ? 'border-emerald-500 bg-emerald-500/10 text-white'
                            : 'border-slate-600 bg-slate-700/50 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            poolForm.pool_type === 'fixed_return' ? 'border-emerald-400' : 'border-slate-500'
                          }`}>
                            {poolForm.pool_type === 'fixed_return' && <div className="w-2 h-2 rounded-full bg-emerald-400"></div>}
                          </div>
                          <span className="font-bold">Fixed Return</span>
                        </div>
                        <p className="text-xs text-slate-400 ml-6">Fixed annual %, paid on a schedule (monthly, quarterly, annually)</p>
                      </button>
                    </div>
                  </div>

                  {/* Pool-type specific fields */}
                  {poolForm.pool_type === 'merchant_rate' ? (
                    <div>
                      <h3 className="text-white font-semibold mb-4 text-lg">Merchant Rate</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-slate-300 text-sm font-semibold mb-2">Rate Per Transaction %</label>
                          <input
                            type="number"
                            value={poolForm.investor_profit_share}
                            onChange={e => setPoolForm(prev => ({ ...prev, investor_profit_share: e.target.value }))}
                            placeholder="3"
                            min="0"
                            max="100"
                            step="0.5"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/50 outline-none text-2xl font-bold"
                          />
                        </div>
                        <div className="flex items-end">
                          <div className="bg-slate-700/30 rounded-lg p-4 w-full">
                            <div className="text-slate-400 text-sm mb-1">How it works</div>
                            <div className="text-white text-sm">
                              Every time the dealer uses investor capital for a transaction, the investor automatically earns <span className="text-orange-400 font-bold">{poolForm.investor_profit_share || 3}%</span> of the transaction amount.
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Example calculator */}
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
                        <div className="text-orange-400 text-sm font-semibold mb-2">Example</div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-slate-400 text-xs">Transaction</div>
                            <div className="text-white font-bold text-lg">$15,000</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-xs">Rate</div>
                            <div className="text-orange-400 font-bold text-lg">{poolForm.investor_profit_share || 3}%</div>
                          </div>
                          <div>
                            <div className="text-slate-400 text-xs">Investor Earns</div>
                            <div className="text-green-400 font-bold text-lg">${((15000 * (Number(poolForm.investor_profit_share) || 3)) / 100).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : poolForm.pool_type === 'profit_share' ? (
                    <div>
                      <h3 className="text-white font-semibold mb-4 text-lg">Profit Split</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <label className="block text-slate-300 text-sm font-semibold mb-2">Investor Share %</label>
                          <input
                            type="number"
                            value={poolForm.investor_profit_share}
                            onChange={e => setPoolForm(prev => ({ ...prev, investor_profit_share: e.target.value }))}
                            placeholder="60"
                            min="0"
                            max="100"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 text-sm font-semibold mb-2">Platform Fee %</label>
                          <input
                            type="number"
                            value={poolForm.platform_fee_share}
                            onChange={e => setPoolForm(prev => ({ ...prev, platform_fee_share: e.target.value }))}
                            placeholder="20"
                            min="0"
                            max="100"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 text-sm font-semibold mb-2">Dealer Share %</label>
                          <input
                            type="number"
                            value={poolForm.dealer_profit_share}
                            onChange={e => setPoolForm(prev => ({ ...prev, dealer_profit_share: e.target.value }))}
                            placeholder="20"
                            min="0"
                            max="100"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                          />
                        </div>
                      </div>

                      {/* Visual split preview */}
                      <div className="bg-slate-700/30 rounded-lg p-4">
                        <div className="text-slate-400 text-sm mb-3">Per-Transaction Profit Split</div>
                        <div className="flex h-8 rounded-lg overflow-hidden mb-3">
                          <div
                            className="bg-violet-500 flex items-center justify-center text-white text-xs font-bold transition-all"
                            style={{ width: `${Number(poolForm.investor_profit_share) || 0}%` }}
                          >
                            {Number(poolForm.investor_profit_share) > 10 ? `${poolForm.investor_profit_share}%` : ''}
                          </div>
                          <div
                            className="bg-amber-500 flex items-center justify-center text-white text-xs font-bold transition-all"
                            style={{ width: `${Number(poolForm.platform_fee_share) || 0}%` }}
                          >
                            {Number(poolForm.platform_fee_share) > 10 ? `${poolForm.platform_fee_share}%` : ''}
                          </div>
                          <div
                            className="bg-green-500 flex items-center justify-center text-white text-xs font-bold transition-all"
                            style={{ width: `${Number(poolForm.dealer_profit_share) || 0}%` }}
                          >
                            {Number(poolForm.dealer_profit_share) > 10 ? `${poolForm.dealer_profit_share}%` : ''}
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-violet-500"></div>
                            <span className="text-slate-300">Investor {poolForm.investor_profit_share}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-amber-500"></div>
                            <span className="text-slate-300">Platform {poolForm.platform_fee_share}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-green-500"></div>
                            <span className="text-slate-300">Dealer {poolForm.dealer_profit_share}%</span>
                          </div>
                        </div>
                        {(Number(poolForm.investor_profit_share || 0) + Number(poolForm.platform_fee_share || 0) + Number(poolForm.dealer_profit_share || 0)) !== 100 && (
                          <div className="mt-2 text-amber-400 text-xs">
                            Total: {Number(poolForm.investor_profit_share || 0) + Number(poolForm.platform_fee_share || 0) + Number(poolForm.dealer_profit_share || 0)}% (should be 100%)
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-white font-semibold mb-4 text-lg">Fixed Return Terms</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-slate-300 text-sm font-semibold mb-2">Annual Return Rate %</label>
                          <input
                            type="number"
                            step="0.01"
                            value={poolForm.annual_return_rate}
                            onChange={e => setPoolForm(prev => ({ ...prev, annual_return_rate: e.target.value }))}
                            placeholder="8.50"
                            min="0"
                            max="100"
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-300 text-sm font-semibold mb-2">Payout Frequency</label>
                          <select
                            value={poolForm.payout_frequency}
                            onChange={e => setPoolForm(prev => ({ ...prev, payout_frequency: e.target.value }))}
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="annually">Annually</option>
                          </select>
                        </div>
                      </div>

                      {/* Earnings preview */}
                      {(() => {
                        const preview = calcFixedReturnPreview(
                          poolForm.min_investment || 10000,
                          poolForm.annual_return_rate,
                          poolForm.payout_frequency
                        );
                        return (
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                            <div className="text-emerald-300 font-semibold mb-2">Investor Earnings Preview</div>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <div className="text-2xl font-bold text-white">{formatCurrency(poolForm.min_investment || 10000)}</div>
                                <div className="text-slate-400 text-xs">Investment</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-emerald-400">{formatCurrency(preview.annual)}</div>
                                <div className="text-slate-400 text-xs">Per Year</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-blue-400">{formatCurrency(preview.per)}</div>
                                <div className="text-slate-400 text-xs">Per {preview.label}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Investment Limits */}
                  <div>
                    <h3 className="text-white font-semibold mb-4 text-lg">Investment Limits</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-slate-300 text-sm font-semibold mb-2">Min Investment ($) *</label>
                        <input
                          type="number"
                          value={poolForm.min_investment}
                          onChange={e => setPoolForm(prev => ({ ...prev, min_investment: e.target.value }))}
                          placeholder="10000"
                          min="0"
                          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 text-sm font-semibold mb-2">Max Investment ($) (optional)</label>
                        <input
                          type="number"
                          value={poolForm.max_investment}
                          onChange={e => setPoolForm(prev => ({ ...prev, max_investment: e.target.value }))}
                          placeholder="No limit"
                          min="0"
                          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Create Pool button */}
                  <div className="pt-4 border-t border-slate-700">
                    <button
                      onClick={handleCreatePool}
                      disabled={creatingPool || !poolForm.pool_name}
                      className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-bold text-lg transition"
                    >
                      {creatingPool ? 'Creating Pool...' : 'Create Pool'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  onClick={() => setShowCreatePool(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create New Pool
                </button>
              </div>
            )}

            {/* Existing pools list */}
            {pools.map(pool => (
              <div key={pool.id} className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl font-bold text-white">{pool.pool_name}</h2>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getPoolTypeBadge(pool.pool_type)}`}>
                          {getPoolTypeLabel(pool.pool_type)}
                        </span>
                      </div>
                      <p className="text-slate-400">{pool.description}</p>
                    </div>
                  </div>
                  <span className={`text-sm px-3 py-1 rounded-full font-semibold ${getStatusColor(pool.status)}`}>
                    {pool.status}
                  </span>
                </div>

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

                {/* Terms section - adapts to pool type */}
                <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
                  {pool.pool_type === 'fixed_return' ? (
                    <>
                      <h3 className="text-white font-semibold mb-3">Fixed Return Terms</h3>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-slate-400">Annual Return Rate</div>
                          <div className="text-emerald-400 font-bold text-lg">{pool.annual_return_rate}%</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Payout Frequency</div>
                          <div className="text-blue-400 font-bold text-lg">{getPayoutLabel(pool.payout_frequency)}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Min Investment</div>
                          <div className="text-white font-bold text-lg">{formatCurrency(pool.min_investment)}</div>
                        </div>
                      </div>
                      {(() => {
                        const preview = calcFixedReturnPreview(pool.min_investment || 10000, pool.annual_return_rate, pool.payout_frequency);
                        return (
                          <div className="mt-3 pt-3 border-t border-slate-600 text-sm text-slate-400">
                            Example: {formatCurrency(pool.min_investment || 10000)} invested = {formatCurrency(preview.annual)}/year = {formatCurrency(preview.per)}/{preview.label}
                          </div>
                        );
                      })()}
                    </>
                  ) : pool.pool_type === 'merchant_rate' ? (
                    <>
                      <h3 className="text-white font-semibold mb-3">Merchant Rate Terms</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-slate-400">Rate Per Transaction</div>
                          <div className="text-orange-400 font-bold text-2xl">{pool.investor_profit_share}%</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Example on $15,000</div>
                          <div className="text-green-400 font-bold text-lg">+${((15000 * (pool.investor_profit_share || 3)) / 100).toLocaleString()}</div>
                          <div className="text-slate-500 text-xs">earned per transaction</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

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
