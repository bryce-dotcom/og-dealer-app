import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { supabase } from '../lib/supabase';

export default function PlaidLinkButton({ investorId, onSuccess, buttonText = 'Link Bank Account', style: customStyle }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (investorId) createLinkToken();
  }, [investorId]);

  async function createLinkToken() {
    try {
      setLoading(true);
      setError(null);

      console.log('[PlaidLink] Creating link token for investor:', investorId);

      const { data, error: fnError } = await supabase.functions.invoke('plaid-create-link-token', {
        body: { investor_id: investorId }
      });

      console.log('[PlaidLink] Response:', { data, fnError });

      // supabase.functions.invoke returns the response body in data even on error
      // and fnError contains the FunctionsHttpError for non-2xx
      if (fnError) {
        // Try to extract the actual error message from the response
        const errMsg = typeof fnError === 'object' && fnError.message ? fnError.message : String(fnError);
        throw new Error(errMsg);
      }

      if (data?.success) {
        setLinkToken(data.link_token);
        console.log('[PlaidLink] Link token created successfully');
      } else {
        throw new Error(data?.error || 'Failed to create link token');
      }
    } catch (err) {
      console.error('[PlaidLink] Error creating link token:', err);
      setError(err.message || 'Failed to connect to Plaid');
    } finally {
      setLoading(false);
    }
  }

  const onPlaidSuccess = useCallback(async (public_token, metadata) => {
    try {
      setLoading(true);

      const { data, error: fnError } = await supabase.functions.invoke('plaid-exchange-token', {
        body: {
          investor_id: investorId,
          public_token: public_token,
          account_id: metadata.account_id,
          metadata: metadata
        }
      });

      if (fnError) throw fnError;

      if (data.success) {
        alert('Bank account linked successfully!');
        if (onSuccess) onSuccess(data.account);
      } else {
        throw new Error(data.error || 'Failed to link account');
      }
    } catch (err) {
      console.error('Error exchanging token:', err);
      alert('Failed to link bank account: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [investorId, onSuccess]);

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: onPlaidSuccess,
    onExit: (err) => {
      if (err) console.error('[PlaidLink] Exit with error:', err);
    },
  });

  const disabled = !ready || loading || !linkToken;

  const baseStyle = {
    padding: '14px 28px',
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: disabled ? '#e5e7eb' : '#111827',
    color: disabled ? '#9ca3af' : '#fff',
    ...customStyle,
  };

  if (error) {
    return (
      <div>
        <button
          onClick={() => createLinkToken()}
          style={{ ...baseStyle, backgroundColor: '#dc2626', color: '#fff', cursor: 'pointer' }}
        >
          <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Retry Connection
        </button>
        <p style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{error}</p>
      </div>
    );
  }

  return (
    <button
      onClick={() => open()}
      disabled={disabled}
      style={baseStyle}
      onMouseOver={e => { if (!disabled) e.currentTarget.style.backgroundColor = '#1f2937'; }}
      onMouseOut={e => { if (!disabled) e.currentTarget.style.backgroundColor = '#111827'; }}
    >
      {loading ? (
        <>
          <div style={{ width: 18, height: 18, border: '2px solid #9ca3af', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          Connecting...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {buttonText}
        </>
      )}
    </button>
  );
}
