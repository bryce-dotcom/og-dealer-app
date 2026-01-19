import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';

// Initialize Sentry - REPLACE WITH YOUR DSN
Sentry.init({
  dsn: "https://574f1b2cb8b35505f6116643ab2705ee@o4510735793651712.ingest.us.sentry.io/4510735796207616",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance monitoring
  tracesSampleRate: 1.0,
  // Session replay for errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  // Environment
  environment: import.meta.env.MODE,
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

// Error fallback UI
function ErrorFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#18181b',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '500px',
        textAlign: 'center',
        border: '1px solid #ef4444'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h1 style={{ color: '#fff', fontSize: '24px', marginBottom: '12px' }}>
          Something went wrong
        </h1>
        <p style={{ color: '#a1a1aa', marginBottom: '24px' }}>
          We've been notified and are working on it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 24px',
            backgroundColor: '#f97316',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}