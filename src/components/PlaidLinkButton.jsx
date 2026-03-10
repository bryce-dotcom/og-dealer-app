import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { supabase } from '../lib/supabase';

export default function PlaidLinkButton({ investorId, onSuccess, buttonText = 'Link Bank Account' }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    createLinkToken();
  }, [investorId]);

  async function createLinkToken() {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('plaid-create-link-token', {
        body: { investor_id: investorId }
      });

      if (error) throw error;

      if (data.success) {
        setLinkToken(data.link_token);
      } else {
        throw new Error(data.error || 'Failed to create link token');
      }

    } catch (error) {
      console.error('Error creating link token:', error);
      alert('Failed to initialize Plaid: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const onPlaidSuccess = useCallback(async (public_token, metadata) => {
    console.log('Plaid success:', metadata);

    try {
      setLoading(true);

      // Exchange public token for access token
      const { data, error } = await supabase.functions.invoke('plaid-exchange-token', {
        body: {
          investor_id: investorId,
          public_token: public_token,
          account_id: metadata.account_id,
          metadata: metadata
        }
      });

      if (error) throw error;

      if (data.success) {
        alert('Bank account linked successfully!');
        if (onSuccess) onSuccess(data.account);
      } else {
        throw new Error(data.error || 'Failed to link account');
      }

    } catch (error) {
      console.error('Error exchanging token:', error);
      alert('Failed to link bank account: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [investorId, onSuccess]);

  const config = {
    token: linkToken,
    onSuccess: onPlaidSuccess,
  };

  const { open, ready } = usePlaidLink(config);

  if (!linkToken) {
    return (
      <button
        disabled
        className="px-6 py-3 bg-slate-700 text-slate-400 rounded-lg font-semibold cursor-not-allowed"
      >
        Loading Plaid...
      </button>
    );
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready || loading}
      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition"
    >
      {loading ? 'Connecting...' : buttonText}
    </button>
  );
}
