import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SIGNATURE_PAD_CDN = 'https://cdn.jsdelivr.net/npm/signature_pad@4.2.0/dist/signature_pad.umd.min.js';

// PUBLIC page — no auth. The URL token IS the credential. Used both for the
// in-office iPad handoff and the emailed link the buyer opens on their phone.
export default function SignPage() {
  const { token } = useParams();
  const [ctx, setCtx] = useState(null);
  const [ctxError, setCtxError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const wrapperRef = useRef(null);

  // Load deal context
  useEffect(() => {
    if (!token) { setCtxError('Missing signing token'); return; }
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/get-signing-context?token=${encodeURIComponent(token)}`, {
          headers: { apikey: ANON_KEY },
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setCtx(j);
        if (j.deal?.purchaser_name && !typedName) setTypedName(j.deal.purchaser_name);
      } catch (e) {
        setCtxError(e.message || 'Could not load this signing link');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load signature_pad and initialize
  useEffect(() => {
    if (!ctx || ctx.already_signed) return;
    let cancelled = false;
    const initPad = () => {
      if (cancelled || !canvasRef.current || !window.SignaturePad) return;
      resizeCanvas();
      padRef.current = new window.SignaturePad(canvasRef.current, {
        minWidth: 1.2,
        maxWidth: 3,
        penColor: '#0a0a0a',
        backgroundColor: '#ffffff',
      });
    };
    if (window.SignaturePad) {
      initPad();
    } else {
      const script = document.createElement('script');
      script.src = SIGNATURE_PAD_CDN;
      script.onload = initPad;
      script.onerror = () => setSubmitError('Could not load signature library. Refresh the page.');
      document.body.appendChild(script);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // Match canvas backing store to the CSS size and device pixel ratio so lines
  // stay crisp on retina/iPad screens.
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = wrapper.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    if (padRef.current) padRef.current.clear();
  }, []);

  useEffect(() => {
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [resizeCanvas]);

  const handleClear = () => padRef.current?.clear();

  const handleSubmit = async () => {
    setSubmitError(null);
    if (!padRef.current || padRef.current.isEmpty()) {
      setSubmitError('Please sign in the box above before submitting.');
      return;
    }
    if (!typedName.trim()) {
      setSubmitError('Please type your full legal name to confirm.');
      return;
    }
    setSubmitting(true);
    try {
      const dataUrl = padRef.current.toDataURL('image/png');
      const r = await fetch(`${SUPABASE_URL}/functions/v1/sign-deal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ token, signature_png: dataUrl, signed_by_name: typedName.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDone(true);
    } catch (e) {
      setSubmitError(e.message || 'Could not submit signature');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----

  if (ctxError) return <SignShell><ErrorCard title="Link not valid" message={ctxError} /></SignShell>;
  if (!ctx) return <SignShell><Loading /></SignShell>;
  if (ctx.already_signed || done) return <SignShell><ThankYou ctx={ctx} /></SignShell>;

  const { dealer, vehicle, deal, documents } = ctx;
  const money = (n) => n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const vehicleLine = vehicle
    ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}${vehicle.trim ? ' ' + vehicle.trim : ''}`.trim()
    : '';

  return (
    <SignShell>
      <div style={{ padding: '20px 16px 8px' }}>
        <div style={{ fontSize: 13, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {dealer?.dealer_name || 'Dealer'}
        </div>
        <h1 style={{ fontSize: 24, margin: '6px 0 4px', color: '#0a0a0a', fontWeight: 700 }}>
          Sign your purchase paperwork
        </h1>
        <div style={{ color: '#555', fontSize: 15 }}>
          Hi {deal?.purchaser_name || 'buyer'} — one signature signs everything below.
        </div>
      </div>

      <div style={{ margin: '16px 12px', border: '1px solid #e5e5e5', borderRadius: 12, background: '#fafafa', padding: 14 }}>
        {vehicleLine && (
          <Row label="Vehicle" value={vehicleLine} />
        )}
        {vehicle?.vin && <Row label="VIN" value={vehicle.vin} mono />}
        {deal?.total_due != null && <Row label="Total due" value={money(deal.total_due)} bold />}
        {deal?.date_of_sale && <Row label="Sale date" value={new Date(deal.date_of_sale).toLocaleDateString()} />}
      </div>

      {documents.length > 0 && (
        <details style={{ margin: '0 12px 16px', border: '1px solid #e5e5e5', borderRadius: 12, background: '#fff' }}>
          <summary style={{ padding: 14, cursor: 'pointer', fontWeight: 600 }}>
            Documents you're signing ({documents.length})
          </summary>
          <div style={{ padding: '0 14px 14px', fontSize: 14, color: '#333' }}>
            {documents.map((d, i) => (
              <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid #eee' : 'none', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{d.form_name || d.form_number}</span>
                {d.public_url && (
                  <a href={d.public_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0060df', textDecoration: 'none', flexShrink: 0 }}>
                    Review →
                  </a>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ padding: '0 12px' }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#0a0a0a' }}>
          Sign below
        </label>
        <div
          ref={wrapperRef}
          style={{
            width: '100%',
            height: 220,
            background: '#fff',
            border: '2px solid #d0d0d0',
            borderRadius: 12,
            touchAction: 'none',
            overflow: 'hidden',
          }}
        >
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
        <button
          type="button"
          onClick={handleClear}
          style={{
            marginTop: 8,
            padding: '10px 16px',
            background: '#fff',
            border: '1px solid #d0d0d0',
            borderRadius: 8,
            color: '#333',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ padding: '16px 12px 0' }}>
        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#0a0a0a' }}>
          Type your full legal name to confirm
        </label>
        <input
          type="text"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          autoComplete="name"
          placeholder="First Middle Last"
          style={{
            width: '100%',
            padding: '14px 12px',
            fontSize: 16,
            border: '2px solid #d0d0d0',
            borderRadius: 10,
            background: '#fff',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {submitError && (
        <div style={{ margin: '12px 12px 0', padding: 12, background: '#fef1f1', border: '1px solid #f5c2c2', borderRadius: 8, color: '#8b1e1e', fontSize: 14 }}>
          {submitError}
        </div>
      )}

      <div style={{ padding: '16px 12px 32px' }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
          By signing, I authorize {dealer?.dealer_name || 'the dealer'} to apply my signature to the documents listed above and I acknowledge the sale terms shown.
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '18px 16px',
            background: submitting ? '#888' : '#0a7c2f',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 18,
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(10,124,47,0.25)',
          }}
        >
          {submitting ? 'Submitting…' : 'Sign & submit'}
        </button>
      </div>
    </SignShell>
  );
}

function SignShell({ children }) {
  return (
    <>
      <MobileViewportMeta />
      <div style={{
        minHeight: '100vh',
        background: '#f4f4f5',
        color: '#0a0a0a',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        WebkitFontSmoothing: 'antialiased',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto', background: '#fff', minHeight: '100vh' }}>
          {children}
        </div>
      </div>
    </>
  );
}

function MobileViewportMeta() {
  // Ensure the viewport is mobile-friendly even if the main index.html hasn't
  // set the right meta tag (some app shells only set width=1024).
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    const desired = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
    const original = meta ? meta.getAttribute('content') : null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', desired);
    return () => {
      if (original != null) meta.setAttribute('content', original);
    };
  }, []);
  return null;
}

function Row({ label, value, mono, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 12 }}>
      <span style={{ color: '#666', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#0a0a0a', fontSize: bold ? 17 : 14, fontWeight: bold ? 700 : 400, fontFamily: mono ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function Loading() {
  return <div style={{ padding: 48, textAlign: 'center', color: '#666' }}>Loading your paperwork…</div>;
}

function ErrorCard({ title, message }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8, color: '#8b1e1e' }}>{title}</h1>
      <div style={{ color: '#555', lineHeight: 1.5 }}>{message}</div>
      <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
        If you were sent this link by mistake, contact the dealership.
      </div>
    </div>
  );
}

function ThankYou({ ctx }) {
  const dealer = ctx.dealer?.dealer_name || 'the dealership';
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>✓</div>
      <h1 style={{ fontSize: 24, marginBottom: 8, color: '#0a7c2f' }}>Signature received</h1>
      <div style={{ color: '#555', lineHeight: 1.5, marginBottom: 24 }}>
        Your signature has been added to your purchase paperwork.
        {ctx.signed_at && <> ({new Date(ctx.signed_at).toLocaleString()})</>}
      </div>
      <div style={{ color: '#666', fontSize: 14 }}>
        A signed copy is being prepared. You can safely close this page — {dealer} will send you a final copy for your records.
      </div>
    </div>
  );
}
