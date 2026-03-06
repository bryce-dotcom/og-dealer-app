import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function MarketplaceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dealerId, setDealerId] = useState(null);

  // Facebook state
  const [facebookSettings, setFacebookSettings] = useState(null);
  const [facebookStats, setFacebookStats] = useState({ active: 0, pending: 0, errors: 0 });

  // KSL state (placeholder for future)
  const [kslSettings, setKslSettings] = useState(null);

  // AutoTrader state (placeholder for future)
  const [autotraderSettings, setAutotraderSettings] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);

      // Get current dealer_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('dealer_id')
        .eq('auth_id', user.id)
        .single();

      if (empError) throw empError;
      setDealerId(employee.dealer_id);

      // Load marketplace settings
      const { data: settings, error: settingsError } = await supabase
        .from('marketplace_settings')
        .select('*')
        .eq('dealer_id', employee.dealer_id);

      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

      // Parse settings by marketplace
      if (settings) {
        setFacebookSettings(settings.find(s => s.marketplace === 'facebook'));
        setKslSettings(settings.find(s => s.marketplace === 'ksl'));
        setAutotraderSettings(settings.find(s => s.marketplace === 'autotrader'));
      }

      // Load Facebook stats
      if (settings?.find(s => s.marketplace === 'facebook')) {
        await loadFacebookStats(employee.dealer_id);
      }

    } catch (error) {
      console.error('Error loading settings:', error);
      alert('Failed to load marketplace settings');
    } finally {
      setLoading(false);
    }
  }

  async function loadFacebookStats(dealerId) {
    try {
      const { data: listings, error } = await supabase
        .from('marketplace_listings')
        .select('status')
        .eq('dealer_id', dealerId)
        .eq('marketplace', 'facebook');

      if (error) throw error;

      const stats = {
        active: listings?.filter(l => l.status === 'active').length || 0,
        pending: listings?.filter(l => l.status === 'pending').length || 0,
        errors: listings?.filter(l => l.status === 'error').length || 0,
      };

      setFacebookStats(stats);
    } catch (error) {
      console.error('Error loading Facebook stats:', error);
    }
  }

  async function handleFacebookOAuth() {
    try {
      // Facebook OAuth URL
      const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
      if (!appId) {
        alert('Facebook App ID not configured. Please contact support.');
        return;
      }

      const redirectUri = `${window.location.origin}/marketplace/facebook/callback`;
      const scope = 'catalog_management,pages_manage_ads,pages_show_list';

      const oauthUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${appId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${scope}` +
        `&response_type=code` +
        `&state=${dealerId}`;

      window.location.href = oauthUrl;
    } catch (error) {
      console.error('Error initiating Facebook OAuth:', error);
      alert('Failed to connect to Facebook');
    }
  }

  async function handleDisconnect(marketplace) {
    if (!confirm(`Disconnect ${marketplace}? Your listings will remain active but won't sync.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('marketplace_settings')
        .update({ enabled: false })
        .eq('dealer_id', dealerId)
        .eq('marketplace', marketplace);

      if (error) throw error;

      alert(`${marketplace} disconnected successfully`);
      loadSettings();
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect');
    }
  }

  async function handleSyncNow(marketplace) {
    if (!confirm(`Sync all inventory to ${marketplace}? This may take a few minutes.`)) {
      return;
    }

    try {
      setSyncing(true);

      const functionName = marketplace === 'facebook' ? 'sync-to-facebook' :
                          marketplace === 'ksl' ? 'sync-to-ksl' :
                          'sync-to-autotrader';

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { dealer_id: dealerId }
      });

      if (error) throw error;

      if (data.success) {
        alert(`Successfully synced ${data.synced} vehicles to ${marketplace}` +
              (data.errors > 0 ? `\n${data.errors} items had errors` : ''));
        loadSettings();
      } else {
        throw new Error(data.error || 'Sync failed');
      }

    } catch (error) {
      console.error('Error syncing:', error);
      alert(`Failed to sync: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function toggleAutoSync(marketplace, enabled) {
    try {
      const { error } = await supabase
        .from('marketplace_settings')
        .update({ auto_sync: enabled })
        .eq('dealer_id', dealerId)
        .eq('marketplace', marketplace);

      if (error) throw error;

      loadSettings();
    } catch (error) {
      console.error('Error toggling auto-sync:', error);
      alert('Failed to update auto-sync setting');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading marketplace settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Marketplace Integrations</h1>
        <p className="text-gray-600 mt-2">
          Automatically push your inventory to popular listing platforms to maximize exposure.
        </p>
      </div>

      {/* Facebook Marketplace */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Facebook Marketplace</h2>
              <p className="text-sm text-gray-600">Free listings, massive reach, local buyers</p>
            </div>
          </div>
          {facebookSettings?.enabled && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              ✓ Connected
            </span>
          )}
        </div>

        {facebookSettings?.enabled ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-700">{facebookStats.active}</div>
                <div className="text-sm text-gray-600">Active Listings</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-700">{facebookStats.pending}</div>
                <div className="text-sm text-gray-600">Pending</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-700">{facebookStats.errors}</div>
                <div className="text-sm text-gray-600">Errors</div>
              </div>
            </div>

            {/* Sync Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Last Sync:</span>
                  <span className="ml-2 font-medium">
                    {facebookSettings.last_sync_at
                      ? new Date(facebookSettings.last_sync_at).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Status:</span>
                  <span className={`ml-2 font-medium ${
                    facebookSettings.last_sync_status === 'success' ? 'text-green-600' :
                    facebookSettings.last_sync_status === 'error' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {facebookSettings.last_sync_status || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Sync Frequency:</span>
                  <span className="ml-2 font-medium capitalize">
                    {facebookSettings.sync_frequency}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-600">Auto-Sync:</span>
                  <label className="ml-2 relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={facebookSettings.auto_sync}
                      onChange={(e) => toggleAutoSync('facebook', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {facebookSettings.last_sync_error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <div className="font-medium text-red-800">Last sync error:</div>
                    <div className="text-sm text-red-700">{facebookSettings.last_sync_error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => handleSyncNow('facebook')}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={() => handleDisconnect('facebook')}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Disconnect
              </button>
              <button className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                Settings
              </button>
            </div>
          </>
        ) : (
          <div>
            <p className="text-gray-600 mb-4">
              Connect your Facebook Business account to automatically sync your inventory to Facebook Marketplace.
            </p>
            <button
              onClick={handleFacebookOAuth}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Connect Facebook Account
            </button>
          </div>
        )}
      </div>

      {/* KSL Classifieds - Placeholder */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">KSL Classifieds</h2>
              <p className="text-sm text-gray-600">Utah-focused, local market dominance</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
            Coming Soon
          </span>
        </div>
        <p className="text-gray-600">
          KSL Classifieds integration will be available soon. Contact support to get early access.
        </p>
      </div>

      {/* AutoTrader - Placeholder */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AutoTrader</h2>
              <p className="text-sm text-gray-600">National reach, serious buyers</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
            Coming Soon
          </span>
        </div>
        <p className="text-gray-600">
          AutoTrader integration will be available soon. Requires an active AutoTrader dealer subscription.
        </p>
      </div>
    </div>
  );
}
