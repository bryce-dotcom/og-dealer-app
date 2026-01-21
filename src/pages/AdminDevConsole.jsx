import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function AdminDevConsole() {
  const navigate = useNavigate();
  const { dealerId, dealer } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316'
  };

  const [errors, setErrors] = useState([]);
  const [errorsLoading, setErrorsLoading] = useState(true);
  const [errorsError, setErrorsError] = useState(null);
  const [featureRequest, setFeatureRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [selectedError, setSelectedError] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState(null);

  // Admin check - only Bryce can access
  useEffect(() => {
    if (!dealerId || dealer?.dealer_name !== 'OG DiX Motor Club') {
      navigate('/dashboard');
    }
  }, [dealerId, dealer, navigate]);

  // Fetch real errors from Sentry via Edge Function
  const fetchErrors = async () => {
    setErrorsLoading(true);
    setErrorsError(null);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-sentry-errors');

      if (error) throw error;

      if (data.error) {
        setErrorsError(data.error);
        setErrors([]);
      } else {
        setErrors(data.errors || []);
      }
    } catch (err) {
      console.error('Failed to fetch errors:', err);
      setErrorsError(err.message);
      setErrors([]);
    }

    setErrorsLoading(false);
  };

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 60000);
    return () => clearInterval(interval);
  }, []);

  const timeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  const requestFix = async (error) => {
    setSelectedError(error);
    setLoading(true);
    setAiResponse(null);
    setDeployResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-code-fix', {
        body: {
          errorMessage: error.message,
          file: error.culprit,
          type: 'fix'
        }
      });

      if (fnError) throw fnError;
      setAiResponse(data);
    } catch (err) {
      console.error('AI fix error:', err);
      setAiResponse({ error: err.message });
    }
    setLoading(false);
  };

  const requestFeature = async () => {
    if (!featureRequest.trim()) return;

    setSelectedError(null);
    setLoading(true);
    setAiResponse(null);
    setDeployResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-code-fix', {
        body: {
          featureRequest: featureRequest,
          type: 'feature'
        }
      });

      if (fnError) throw fnError;
      setAiResponse(data);
    } catch (err) {
      console.error('Feature request error:', err);
      setAiResponse({ error: err.message });
    }
    setLoading(false);
  };

  const handleDeploy = async () => {
    if (!aiResponse?.code || !aiResponse?.file) {
      alert('No code to deploy. Generate a fix or feature first.');
      return;
    }

    const confirmDeploy = window.confirm(
      `Deploy to ${aiResponse.file}?\n\nThis will push directly to GitHub and auto-deploy to production via Vercel.`
    );

    if (!confirmDeploy) return;

    setDeploying(true);
    setDeployResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('deploy-code', {
        body: {
          filePath: aiResponse.file.startsWith('src/') ? aiResponse.file : `src/${aiResponse.file}`,
          code: aiResponse.code,
          commitMessage: `Auto-fix: ${selectedError?.message?.substring(0, 50) || featureRequest.substring(0, 50) || 'AI generated code'}`
        }
      });

      if (error) throw error;

      setDeployResult({
        success: true,
        message: 'Code deployed successfully! Vercel will auto-deploy in ~30 seconds.',
        commitUrl: data.commitUrl
      });
    } catch (err) {
      console.error('Deploy error:', err);
      setDeployResult({
        success: false,
        message: err.message || 'Failed to deploy code'
      });
    }

    setDeploying(false);
  };

  const copyCode = () => {
    if (aiResponse?.code) {
      navigator.clipboard.writeText(aiResponse.code);
    }
  };

  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px'
  };

  const buttonStyle = {
    padding: '8px 16px',
    backgroundColor: theme.accent,
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer'
  };

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: theme.text, margin: 0 }}>
            OG Dev Console
          </h1>
          <p style={{ color: theme.textMuted, margin: '4px 0 0', fontSize: '14px' }}>
            AI-powered code fixes and feature development
          </p>
        </div>
        <button
          onClick={fetchErrors}
          style={{ ...buttonStyle, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary }}
        >
          Refresh Errors
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <div style={{ ...cardStyle, borderColor: errors.length > 0 ? '#ef4444' : theme.border }}>
            <h2 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: errors.length > 0 ? '#ef4444' : theme.text,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: errorsLoading ? '#eab308' : (errors.length > 0 ? '#ef4444' : '#22c55e'),
                animation: errorsLoading ? 'pulse 1s infinite' : 'none'
              }} />
              Live Errors ({errorsLoading ? '...' : errors.length})
            </h2>

            {errorsLoading ? (
              <p style={{ color: theme.textMuted, fontSize: '14px' }}>Loading errors from Sentry...</p>
            ) : errorsError ? (
              <div style={{ padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>
                Error: {errorsError}
              </div>
            ) : errors.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: '14px' }}>No unresolved errors. Nice work!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto' }}>
                {errors.map(error => (
                  <div
                    key={error.id}
                    style={{
                      padding: '12px',
                      backgroundColor: selectedError?.id === error.id ? 'rgba(249, 115, 22, 0.1)' : theme.bg,
                      borderRadius: '8px',
                      border: `1px solid ${selectedError?.id === error.id ? theme.accent : theme.border}`,
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedError(error)}
                  >
                    <div style={{ color: '#ef4444', fontSize: '13px', fontFamily: 'monospace', marginBottom: '8px', wordBreak: 'break-word' }}>
                      {error.message}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '8px', fontFamily: 'monospace' }}>
                      {error.culprit}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                        {error.count} events - {error.userCount} users - {timeAgo(error.lastSeen)}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={(e) => { e.stopPropagation(); requestFix(error); }} style={buttonStyle}>
                          AI Fix
                        </button>
                        <a
                          href={error.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ ...buttonStyle, backgroundColor: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, textDecoration: 'none' }}
                        >
                          View
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#fbbf24' }}>*</span> Build a Feature
            </h2>
            <textarea
              value={featureRequest}
              onChange={(e) => setFeatureRequest(e.target.value)}
              placeholder={'Describe what you want to build...\n\nExamples:\n- Add a button on inventory that marks vehicle as sold\n- Show total profit on the dashboard\n- Add SMS notifications when payment is due'}
              style={{
                width: '100%',
                minHeight: '140px',
                padding: '12px',
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                color: theme.text,
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '12px',
                fontFamily: 'inherit'
              }}
            />
            <button
              onClick={requestFeature}
              disabled={loading || !featureRequest.trim()}
              style={{ ...buttonStyle, opacity: loading || !featureRequest.trim() ? 0.6 : 1 }}
            >
              {loading ? 'Generating...' : 'Generate Code'}
            </button>
          </div>
        </div>

        <div>
          <div style={{ ...cardStyle, minHeight: '500px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              AI Response
              {selectedError && (
                <span style={{ fontWeight: '400', color: theme.textMuted, fontSize: '13px', marginLeft: '8px' }}>
                  - Fixing: {selectedError.message.substring(0, 40)}...
                </span>
              )}
            </h2>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 40px', color: theme.textMuted }}>
                <div style={{ marginBottom: '16px', fontSize: '32px' }}>{'<>'}</div>
                <div style={{ fontSize: '14px' }}>Analyzing code and generating fix...</div>
                <div style={{ fontSize: '12px', marginTop: '8px', color: theme.textMuted }}>This may take 10-20 seconds</div>
              </div>
            ) : aiResponse ? (
              <div>
                {aiResponse.error ? (
                  <div style={{ color: '#ef4444', padding: '16px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                    <strong>Error:</strong> {aiResponse.error}
                  </div>
                ) : (
                  <>
                    {aiResponse.explanation && (
                      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                        <div style={{ color: '#22c55e', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>EXPLANATION</div>
                        <div style={{ color: theme.text, fontSize: '13px' }}>{aiResponse.explanation}</div>
                      </div>
                    )}

                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '4px' }}>
                        FILE: {aiResponse.file || 'Unknown'}
                      </div>
                      <pre style={{
                        backgroundColor: theme.bg,
                        padding: '16px',
                        borderRadius: '8px',
                        overflow: 'auto',
                        fontSize: '12px',
                        color: theme.text,
                        border: `1px solid ${theme.border}`,
                        maxHeight: '250px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        {aiResponse.code || 'No code generated'}
                      </pre>
                    </div>

                    {deployResult && (
                      <div style={{
                        padding: '12px',
                        backgroundColor: deployResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        border: `1px solid ${deployResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}>
                        <div style={{ color: deployResult.success ? '#22c55e' : '#ef4444', fontSize: '13px', fontWeight: '600' }}>
                          {deployResult.success ? 'SUCCESS: ' : 'ERROR: '}{deployResult.message}
                        </div>
                        {deployResult.commitUrl && (
                          <a
                            href={deployResult.commitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#3b82f6', fontSize: '12px', marginTop: '8px', display: 'inline-block' }}
                          >
                            View commit on GitHub
                          </a>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button onClick={copyCode} style={{ ...buttonStyle, backgroundColor: '#22c55e' }}>
                        Copy Code
                      </button>
                      <button
                        onClick={handleDeploy}
                        disabled={deploying || !aiResponse?.file}
                        style={{
                          ...buttonStyle,
                          backgroundColor: deploying ? '#334155' : '#3b82f6',
                          opacity: deploying || !aiResponse?.file ? 0.6 : 1,
                          cursor: deploying || !aiResponse?.file ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {deploying ? 'Deploying...' : 'Deploy to Production'}
                      </button>
                    </div>

                    {aiResponse.additionalFiles && aiResponse.additionalFiles.length > 0 && (
                      <div style={{ marginTop: '16px', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                        <div style={{ color: theme.textSecondary, fontSize: '12px', marginBottom: '8px' }}>ADDITIONAL FILES NEEDED:</div>
                        {aiResponse.additionalFiles.map((file, i) => (
                          <div key={i} style={{ color: theme.text, fontSize: '13px', fontFamily: 'monospace' }}>- {file}</div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 40px', color: theme.textMuted }}>
                <div style={{ marginBottom: '16px', fontSize: '32px' }}>{'{ }'}</div>
                <div style={{ fontSize: '14px' }}>Select an error to fix</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>or describe a feature to build</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}