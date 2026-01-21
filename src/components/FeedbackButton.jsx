import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState('feedback');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { dealer } = useStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setSending(true);
    try {
      await supabase.from('feedback').insert({
        dealer_id: dealer?.id,
        user_name: dealer?.dealer_name || 'Anonymous',
        type,
        message: message.trim(),
        page: window.location.pathname
      });
      setSent(true);
      setMessage('');
      setTimeout(() => {
        setIsOpen(false);
        setSent(false);
      }, 2000);
    } catch (err) {
      console.error('Feedback error:', err);
    }
    setSending(false);
  };

  const theme = {
    bg: '#18181b',
    border: '#27272a',
    text: '#ffffff',
    textMuted: '#71717a',
    accent: '#f97316'
  };

  return (
    <>
      {/* Feedback Button - Fixed Position */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '160px',
          right: '24px',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          backgroundColor: theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: '20px',
          color: theme.text,
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.borderColor = theme.accent}
        onMouseOut={(e) => e.currentTarget.style.borderColor = theme.border}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Feedback
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '12px',
              width: '100%',
              maxWidth: '420px',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: theme.text }}>
                Send Feedback
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            {sent ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                <div style={{ color: theme.text, fontSize: '16px', fontWeight: '600' }}>Thanks for your feedback!</div>
                <div style={{ color: theme.textMuted, fontSize: '14px', marginTop: '4px' }}>We'll review it soon.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                {/* Type Selector */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '8px' }}>
                    Type
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { value: 'feedback', label: 'Feedback', icon: '💬' },
                      { value: 'bug', label: 'Bug', icon: '🐛' },
                      { value: 'feature', label: 'Feature Request', icon: '✨' }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setType(opt.value)}
                        style={{
                          flex: 1,
                          padding: '10px 8px',
                          backgroundColor: type === opt.value ? 'rgba(249,115,22,0.15)' : 'transparent',
                          border: `1px solid ${type === opt.value ? theme.accent : theme.border}`,
                          borderRadius: '8px',
                          color: type === opt.value ? theme.accent : theme.textMuted,
                          fontSize: '13px',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        <span style={{ marginRight: '4px' }}>{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '8px' }}>
                    {type === 'bug' ? 'What went wrong?' : type === 'feature' ? 'What would you like to see?' : 'Your feedback'}
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      type === 'bug' 
                        ? 'Describe the issue and steps to reproduce...' 
                        : type === 'feature'
                        ? 'Describe the feature you\'d like...'
                        : 'Tell us what you think...'
                    }
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#09090b',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      color: theme.text,
                      fontSize: '14px',
                      resize: 'vertical',
                      minHeight: '100px'
                    }}
                  />
                </div>

                {/* Current Page Info */}
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: '#09090b',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '12px',
                  color: theme.textMuted
                }}>
                  Page: {window.location.pathname}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!message.trim() || sending}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: message.trim() ? theme.accent : theme.border,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: message.trim() ? 'pointer' : 'not-allowed',
                    opacity: sending ? 0.7 : 1
                  }}
                >
                  {sending ? 'Sending...' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}