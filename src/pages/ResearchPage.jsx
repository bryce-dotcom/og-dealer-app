import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

// Vehicle makes and models
const VEHICLE_DATA = {
  'Ford': ['F-150', 'F-250', 'F-350', 'F-450', 'Mustang', 'Explorer', 'Escape', 'Edge', 'Bronco', 'Ranger', 'Expedition', 'Transit', 'Maverick'],
  'Chevrolet': ['Silverado 1500', 'Silverado 2500', 'Silverado 3500', 'Camaro', 'Corvette', 'Equinox', 'Traverse', 'Tahoe', 'Suburban', 'Colorado', 'Malibu', 'Blazer'],
  'Toyota': ['Camry', 'Corolla', 'RAV4', 'Tacoma', 'Tundra', 'Highlander', '4Runner', 'Prius', 'Sienna', 'Sequoia'],
  'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'HR-V', 'Odyssey', 'Ridgeline', 'Passport'],
  'Ram': ['1500', '2500', '3500', 'ProMaster'],
  'GMC': ['Sierra 1500', 'Sierra 2500', 'Sierra 3500', 'Yukon', 'Acadia', 'Terrain', 'Canyon'],
  'Jeep': ['Wrangler', 'Grand Cherokee', 'Cherokee', 'Compass', 'Gladiator', 'Renegade', 'Wagoneer'],
  'Dodge': ['Charger', 'Challenger', 'Durango'],
  'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Titan', 'Murano', 'Armada'],
  'Hyundai': ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Kona'],
  'Kia': ['Forte', 'K5', 'Sportage', 'Sorento', 'Telluride', 'Soul', 'Seltos'],
  'Subaru': ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'WRX', 'Legacy', 'Ascent'],
  'Other': []
};

const MAKES = Object.keys(VEHICLE_DATA).sort();
const RADIUS_OPTIONS = [
  { value: '50', label: '50 miles' },
  { value: '100', label: '100 miles' },
  { value: '250', label: '250 miles' },
  { value: '500', label: '500 miles' },
  { value: '0', label: 'Nationwide' }
];
const CONDITION_OPTIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

// Data source indicator component - shows green for real data, yellow for estimated
function DataIndicator({ isReal, small = false }) {
  return (
    <span style={{
      display: 'inline-block',
      width: small ? '6px' : '8px',
      height: small ? '6px' : '8px',
      borderRadius: '50%',
      backgroundColor: isReal ? '#22c55e' : '#eab308',
      marginLeft: '6px'
    }} />
  );
}

// Source indicator component
function SourceIndicator({ source, label }) {
  const isReal = source === 'marketcheck' || source === 'nhtsa' || source === 'serpapi';
  const isEstimated = source === 'estimated';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: isReal ? '#22c55e' : isEstimated ? '#eab308' : '#6b7280'
      }} />
      {label && <span style={{ fontSize: '10px', color: isReal ? '#22c55e' : '#eab308' }}>{label}</span>}
    </div>
  );
}

// Trim tier badge component
function TrimTierBadge({ tier }) {
  if (!tier || tier === 'unknown') return null;

  const colors = {
    premium: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
    mid: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
    base: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' }
  };
  const style = colors[tier] || colors.base;

  return (
    <span style={{
      fontSize: '11px',
      fontWeight: '600',
      padding: '3px 8px',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.text,
      textTransform: 'uppercase'
    }}>
      {tier}
    </span>
  );
}

// Source badge component for private party listings
function SourceBadge({ source }) {
  const sourceColors = {
    craigslist: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
    ksl: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
    offerup: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
    cargurus: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
    facebook: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
    default: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' }
  };

  const sourceLower = (source || '').toLowerCase();
  const style = sourceColors[sourceLower] || sourceColors.default;

  return (
    <span style={{
      fontSize: '10px',
      fontWeight: '600',
      padding: '2px 6px',
      borderRadius: '4px',
      backgroundColor: style.bg,
      color: style.text,
      textTransform: 'uppercase'
    }}>
      {source || 'Private'}
    </span>
  );
}

export default function ResearchPage() {
  const { dealer } = useStore();
  const [searchParams] = useSearchParams();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', bgCardHover: '#27272a', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };
  const isDark = themeContext?.darkMode !== false;

  // Form state
  const [searchMode, setSearchMode] = useState('vin');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [miles, setMiles] = useState('60000');
  const [condition, setCondition] = useState('Good');
  const [radius, setRadius] = useState('100');
  const [fuelType, setFuelType] = useState('');

  // General Search state
  const [generalQuery, setGeneralQuery] = useState('');
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalResults, setGeneralResults] = useState(null);
  const [generalError, setGeneralError] = useState(null);

  // Find Comparables state
  const [compYearMin, setCompYearMin] = useState('');
  const [compYearMax, setCompYearMax] = useState('');
  const [compMake, setCompMake] = useState('');
  const [compModel, setCompModel] = useState('');
  const [compMaxPrice, setCompMaxPrice] = useState('');
  const [compMaxMiles, setCompMaxMiles] = useState('');
  const [compLoading, setCompLoading] = useState(false);
  const [compResults, setCompResults] = useState(null);
  const [compError, setCompError] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('values');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const ymmSectionRef = useRef(null);

  // Generate years
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1999 + 1 }, (_, i) => currentYear + 1 - i);
  const models = make ? (VEHICLE_DATA[make] || []) : [];
  const compModels = compMake ? (VEHICLE_DATA[compMake] || []) : [];

  useEffect(() => {
    if (make && !VEHICLE_DATA[make]?.includes(model)) {
      setModel('');
    }
  }, [make]);

  useEffect(() => {
    if (compMake && !VEHICLE_DATA[compMake]?.includes(compModel)) {
      setCompModel('');
    }
  }, [compMake]);

  // URL params on load - handle both VIN and Year/Make/Model params from CustomersPage
  useEffect(() => {
    const urlVin = searchParams.get('vin');
    const urlYear = searchParams.get('year');
    const urlYearMin = searchParams.get('year_min');
    const urlYearMax = searchParams.get('year_max');
    const urlMake = searchParams.get('make');
    const urlModel = searchParams.get('model');
    const urlMiles = searchParams.get('miles');
    const urlMaxPrice = searchParams.get('max_price');
    const urlMaxMiles = searchParams.get('max_miles');
    const urlQuery = searchParams.get('query');

    // Populate General Search from query param (from CustomersPage "Research" button)
    if (urlQuery) {
      setGeneralQuery(urlQuery);
    }

    if (urlVin && urlVin.length === 17) {
      setVin(urlVin);
      setSearchMode('vin');
      if (urlMiles) setMiles(urlMiles);
    } else if (urlYearMin || urlYearMax || urlMake || urlModel || urlMaxPrice || urlMaxMiles) {
      // From CustomersPage - populate YMM fields
      if (urlYearMin || urlYearMax) {
        setYear(urlYearMax || urlYearMin || '');
      }
      if (urlMake) setMake(urlMake);
      if (urlModel) setModel(urlModel);
      if (urlMaxMiles) setMiles(urlMaxMiles);
      setSearchMode('ymm');

      // Also populate Find Comparables section
      if (urlYearMin) setCompYearMin(urlYearMin);
      if (urlYearMax) setCompYearMax(urlYearMax);
      if (urlMake) setCompMake(urlMake);
      if (urlModel) setCompModel(urlModel);
      if (urlMaxPrice) setCompMaxPrice(urlMaxPrice);
      if (urlMaxMiles) setCompMaxMiles(urlMaxMiles);

      // Scroll to top to show General Search with the query
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else if (urlYear && urlMake && urlModel) {
      setYear(urlYear);
      setMake(urlMake);
      setModel(urlModel);
      if (urlMiles) setMiles(urlMiles);
      setSearchMode('ymm');
    }
  }, [searchParams]);

  // Scanner functions
  const startScanner = async () => {
    setShowScanner(true);
    setScannerError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      setTimeout(async () => {
        if (!scannerRef.current) return;
        html5QrCodeRef.current = new Html5Qrcode('vin-scanner');
        try {
          await html5QrCodeRef.current.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 300, height: 100 }, aspectRatio: 3.0 },
            (decodedText) => {
              const cleanVin = decodedText.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
              if (cleanVin.length === 17) {
                setVin(cleanVin);
                stopScanner();
              }
            },
            () => {}
          );
        } catch (err) {
          setScannerError(err.message || 'Failed to start camera');
        }
      }, 100);
    } catch (err) {
      setScannerError('Scanner library not available');
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
      } catch (err) {}
    }
    setShowScanner(false);
  };

  // General Search function
  const handleGeneralSearch = async () => {
    if (!generalQuery.trim()) {
      setGeneralError('Enter a search query');
      return;
    }

    setGeneralLoading(true);
    setGeneralError(null);
    setGeneralResults(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('vehicle-research', {
        body: { general_query: generalQuery.trim() }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setGeneralResults(data);
    } catch (err) {
      setGeneralError(err.message || 'Search failed');
    } finally {
      setGeneralLoading(false);
    }
  };

  // Find Comparables function
  const handleComparablesSearch = async () => {
    if (!compMake && !compModel) {
      setCompError('Enter at least make or model');
      return;
    }

    setCompLoading(true);
    setCompError(null);
    setCompResults(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('vehicle-research', {
        body: {
          search_comparables: true,
          year_min: compYearMin ? parseInt(compYearMin) : null,
          year_max: compYearMax ? parseInt(compYearMax) : null,
          make: compMake || null,
          model: compModel || null,
          max_price: compMaxPrice ? parseInt(compMaxPrice) : null,
          max_miles: compMaxMiles ? parseInt(compMaxMiles) : null,
          radius_miles: 250,
          zip_code: dealer?.zip || '84065'
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setCompResults(data);
    } catch (err) {
      setCompError(err.message || 'Search failed');
    } finally {
      setCompLoading(false);
    }
  };

  // Search function
  const handleSearch = async () => {
    if (searchMode === 'vin' && (!vin || vin.length !== 17)) {
      setError('Enter valid 17-character VIN');
      return;
    }
    if (searchMode === 'ymm' && (!year || !make || !model)) {
      setError('Year, Make, and Model required');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('vehicle-research', {
        body: {
          vin: searchMode === 'vin' ? vin.toUpperCase() : null,
          year: searchMode === 'ymm' ? parseInt(year) : null,
          make: searchMode === 'ymm' ? make : null,
          model: searchMode === 'ymm' ? model : null,
          trim: trim || null,
          miles: parseInt(miles) || 60000,
          condition,
          zip_code: dealer?.zip || '84065',
          radius_miles: parseInt(radius) || 100,
          fuel_type: fuelType || null
        }
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      setResults(data);
      setActiveTab('values');
    } catch (err) {
      setError(err.message || 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  // Formatters - handle null/undefined properly (0 is valid)
  const formatCurrency = (num) => {
    if (num === null || num === undefined) return 'N/A';
    if (typeof num !== 'number' || isNaN(num)) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  // Format currency with +/- sign for adjustments
  const formatAdjustment = (num) => {
    if (num === null || num === undefined) return 'N/A';
    if (typeof num !== 'number' || isNaN(num)) return 'N/A';
    const prefix = num >= 0 ? '+' : '';
    return prefix + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return new Intl.NumberFormat('en-US').format(num);
  };

  // Check if valuations are from real data
  const hasRealData = (results) => results?.valuations?.sample_size > 0;

  // Get adjustments from results
  const getAdjustments = (results) => {
    const adj = results?.valuations?.adjustments || {};
    return {
      mileage_adj: adj.mileage_adj ?? null,
      mileage_per_mile: adj.mileage_per_mile ?? null,
      miles_from_avg: adj.miles_from_avg ?? null,
      avg_miles: adj.avg_miles ?? null
    };
  };

  // Check if engine is diesel
  const isDiesel = (engine) => {
    if (!engine) return false;
    return engine.toLowerCase().includes('diesel');
  };

  // Styles
  const inputStyle = {
    padding: '12px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`,
    backgroundColor: isDark ? theme.bgCard : '#ffffff', color: theme.text, fontSize: '15px', outline: 'none', width: '100%'
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23${isDark ? 'a1a1aa' : '71717a'}' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '36px'
  };

  const cardStyle = {
    backgroundColor: isDark ? theme.bgCard : '#ffffff', borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px'
  };

  const btnStyle = (active = false) => ({
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    backgroundColor: active ? theme.accent : (isDark ? theme.border : '#e4e4e7'),
    color: active ? '#fff' : theme.textSecondary,
    fontWeight: '600', cursor: 'pointer'
  });

  const tabs = [
    { id: 'values', label: 'Valuations' },
    { id: 'market', label: 'Market Analysis' },
    { id: 'comparables', label: 'Comparables' },
    { id: 'specs', label: 'Specs' }
  ];

  return (
    <div style={{ padding: '24px', backgroundColor: theme.bg, minHeight: '100vh', color: theme.text }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0, color: theme.text }}>Vehicle Research</h1>
          <p style={{ color: theme.textMuted, margin: '8px 0 0', fontSize: '14px' }}>Get instant valuations and market analysis</p>
        </div>

        {/* GENERAL SEARCH SECTION - NEW */}
        <div style={{ ...cardStyle, marginBottom: '24px', border: '2px solid #3b82f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <h3 style={{ margin: 0, color: '#3b82f6', fontSize: '16px', fontWeight: '600' }}>General Search</h3>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <input
                value={generalQuery}
                onChange={(e) => setGeneralQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeneralSearch()}
                placeholder="Search anything: best trucks under 30k, diesel vs gas F250..."
                style={inputStyle}
              />
            </div>
            <button
              onClick={handleGeneralSearch}
              disabled={generalLoading}
              style={{ ...btnStyle(true), backgroundColor: '#3b82f6', padding: '12px 24px', opacity: generalLoading ? 0.6 : 1 }}
            >
              {generalLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {generalError && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
              {generalError}
            </div>
          )}

          {generalResults && (
            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px' }}>
              {generalResults.response ? (
                <div style={{ color: theme.text, fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {generalResults.response}
                </div>
              ) : generalResults.message ? (
                <div style={{ color: theme.text, fontSize: '14px', lineHeight: '1.6' }}>
                  {generalResults.message}
                </div>
              ) : (
                <div style={{ color: theme.textMuted, fontSize: '14px' }}>No results found</div>
              )}
            </div>
          )}
        </div>

        {/* Search Form */}
        <div ref={ymmSectionRef} style={{ ...cardStyle, marginBottom: '24px' }}>
          {/* Mode Toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => setSearchMode('vin')} style={btnStyle(searchMode === 'vin')}>Search by VIN</button>
            <button onClick={() => setSearchMode('ymm')} style={btnStyle(searchMode === 'ymm')}>Search by Year/Make/Model</button>
          </div>

          {searchMode === 'vin' ? (
            <div>
              {/* VIN Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'end', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>VIN</label>
                  <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17-character VIN" style={inputStyle} maxLength={17} />
                </div>
                <button onClick={startScanner} style={{ ...btnStyle(), padding: '12px 16px' }} title="Scan VIN">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
                <button onClick={handleSearch} disabled={loading} style={{ ...btnStyle(true), padding: '12px 32px', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Searching...' : 'Research'}
                </button>
              </div>

              {/* Additional VIN fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Miles *</label>
                  <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="60000" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Condition</label>
                  <select value={condition} onChange={(e) => setCondition(e.target.value)} style={selectStyle}>
                    {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Search Radius</label>
                  <select value={radius} onChange={(e) => setRadius(e.target.value)} style={selectStyle}>
                    {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Fuel Type</label>
                  <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} style={selectStyle}>
                    <option value="">Auto-detect</option>
                    <option value="Diesel">Diesel</option>
                    <option value="Gasoline">Gasoline</option>
                    <option value="Electric">Electric</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Year *</label>
                <select value={year} onChange={(e) => setYear(e.target.value)} style={selectStyle}>
                  <option value="">Select Year</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Make *</label>
                <select value={make} onChange={(e) => setMake(e.target.value)} style={selectStyle}>
                  <option value="">Select Make</option>
                  {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Model *</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle} disabled={!make}>
                  <option value="">Select Model</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Trim</label>
                <input value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="Platinum, XLT, etc." style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Miles *</label>
                <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="60000" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Condition</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} style={selectStyle}>
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Search Radius</label>
                <select value={radius} onChange={(e) => setRadius(e.target.value)} style={selectStyle}>
                  {RADIUS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Fuel Type</label>
                <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} style={selectStyle}>
                  <option value="">Any</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Gasoline">Gasoline</option>
                  <option value="Electric">Electric</option>
                  <option value="Hybrid">Hybrid</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button onClick={handleSearch} disabled={loading} style={{ ...btnStyle(true), width: '100%', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Searching...' : 'Research'}
                </button>
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{error}</div>}
        </div>

        {/* Scanner Modal */}
        {showScanner && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', maxWidth: '500px', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: theme.text }}>Scan VIN Barcode</h3>
                <button onClick={stopScanner} style={{ background: 'none', border: 'none', color: theme.textMuted, fontSize: '24px', cursor: 'pointer' }}>&times;</button>
              </div>
              <div id="vin-scanner" ref={scannerRef} style={{ width: '100%', minHeight: '250px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden' }} />
              {scannerError && <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{scannerError}</div>}
              <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>Point camera at VIN barcode</p>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <>
            {/* Vehicle Header */}
            <div style={{ ...cardStyle, marginBottom: '20px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: theme.text }}>
                  {results.vehicle?.year} {results.vehicle?.make} {results.vehicle?.model} {results.vehicle?.trim}
                </h2>
                <span style={{ fontSize: '14px', color: theme.textMuted }}>{formatNumber(results.vehicle?.miles)} miles</span>
                {results.vehicle?.fuel_type && (
                  <span style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    backgroundColor: isDiesel(results.vehicle.fuel_type) ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.15)',
                    color: isDiesel(results.vehicle.fuel_type) ? '#eab308' : '#3b82f6',
                    fontWeight: isDiesel(results.vehicle.fuel_type) ? '600' : '400'
                  }}>
                    {results.vehicle.fuel_type}
                  </span>
                )}
                <TrimTierBadge tier={results.trim_tier} />
                <span style={{
                  fontSize: '12px', padding: '4px 10px', borderRadius: '20px',
                  backgroundColor: results.confidence === 'HIGH' ? 'rgba(34,197,94,0.15)' : results.confidence === 'ESTIMATED' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                  color: results.confidence === 'HIGH' ? '#22c55e' : results.confidence === 'ESTIMATED' ? '#ef4444' : '#eab308'
                }}>
                  {results.confidence} Confidence
                </span>
              </div>

              {/* Data Sources */}
              {results.data_sources && (
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap', fontSize: '11px' }}>
                  {Object.entries(results.data_sources).filter(([_, v]) => v).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: value === 'marketcheck' || value === 'nhtsa' || value === 'serpapi' ? '#22c55e' : '#eab308'
                      }} />
                      <span style={{ color: theme.textMuted }}>{key.replace(/_/g, ' ')}:</span>
                      <span style={{ color: theme.text, fontWeight: '500' }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={btnStyle(activeTab === tab.id)}>{tab.label}</button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={cardStyle}>

              {/* Values Tab */}
              {activeTab === 'values' && (() => {
                const adj = getAdjustments(results);
                const bookValues = results.book_values || {};
                return (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Valuations</h3>
                    {results.valuations?.is_estimated ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: 'rgba(234,179,8,0.15)', borderRadius: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#eab308' }} />
                        <span style={{ color: '#eab308', fontSize: '11px', fontWeight: '600' }}>Values are ESTIMATED</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                        <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: '600' }}>Real MarketCheck Data ({results.valuations?.sample_size || 0} vehicles)</span>
                      </div>
                    )}
                  </div>

                  {/* Main Valuations Section */}
                  <div style={{
                    marginBottom: '20px',
                    padding: '16px',
                    backgroundColor: isDark ? theme.bg : '#f8fafc',
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`
                  }}>
                    {/* Retail */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                      borderRadius: '6px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>Retail (MarketCheck)</span>
                        <DataIndicator isReal={hasRealData(results)} small />
                      </div>
                      <span style={{ color: theme.text, fontWeight: '700', fontSize: '16px' }}>
                        {formatCurrency(results.valuations?.retail)}
                      </span>
                    </div>

                    {/* Wholesale (82%) */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>Wholesale (82%)</span>
                      </div>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                        {formatCurrency(results.valuations?.wholesale)}
                      </span>
                    </div>

                    {/* Mileage Adjustment */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>Mileage Adjustment</span>
                        {adj.miles_from_avg !== null && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(107,114,128,0.15)',
                            color: theme.textSecondary
                          }}>
                            {formatNumber(Math.abs(adj.miles_from_avg))} mi {adj.miles_from_avg > 0 ? 'over' : 'under'} avg
                          </span>
                        )}
                      </div>
                      <span style={{
                        color: adj.mileage_adj === null || adj.mileage_adj === undefined ? theme.textMuted : (adj.mileage_adj >= 0 ? '#22c55e' : '#ef4444'),
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>
                        {formatAdjustment(adj.mileage_adj)}
                      </span>
                    </div>

                    {/* Adjusted Wholesale - THE ACQUISITION NUMBER */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      backgroundColor: 'rgba(34,197,94,0.1)',
                      borderRadius: '8px',
                      border: '2px solid #22c55e',
                      marginBottom: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: '700',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#22c55e',
                          color: '#ffffff',
                          textTransform: 'uppercase'
                        }}>
                          BUY AT
                        </span>
                        <span style={{ color: theme.text, fontSize: '14px', fontWeight: '700' }}>Adjusted Wholesale</span>
                      </div>
                      <span style={{ color: '#22c55e', fontWeight: '800', fontSize: '20px' }}>
                        {formatCurrency(results.valuations?.adjusted_wholesale)}
                      </span>
                    </div>

                    {/* Trade-In */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>Trade-In (68%)</span>
                      </div>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                        {formatCurrency(results.valuations?.trade_in)}
                      </span>
                    </div>
                  </div>

                  {/* MSRP if available */}
                  {results.msrp && (
                    <div style={{
                      marginBottom: '20px',
                      padding: '12px 16px',
                      backgroundColor: isDark ? theme.bg : '#f8fafc',
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ color: theme.textMuted, fontSize: '13px' }}>Original MSRP</span>
                      <span style={{ color: theme.textSecondary, fontWeight: '600', fontSize: '16px' }}>
                        {formatCurrency(results.msrp)}
                      </span>
                    </div>
                  )}

                  {/* Book Values Section */}
                  <div style={{
                    padding: '16px',
                    backgroundColor: isDark ? theme.bg : '#f8fafc',
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`
                  }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase' }}>
                      Book Values
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                      {/* KBB */}
                      <div style={{
                        padding: '12px',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>KBB</span>
                          {bookValues.kbb?.source_url && (
                            <a href={bookValues.kbb.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontSize: '10px', textDecoration: 'none' }}>
                              View Source
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: bookValues.kbb?.value ? theme.text : theme.textMuted }}>
                          {bookValues.kbb?.value ? formatCurrency(bookValues.kbb.value) : 'Not Found'}
                        </div>
                      </div>

                      {/* NADA */}
                      <div style={{
                        padding: '12px',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>NADA</span>
                          {bookValues.nada?.source_url && (
                            <a href={bookValues.nada.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontSize: '10px', textDecoration: 'none' }}>
                              View Source
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: bookValues.nada?.value ? theme.text : theme.textMuted }}>
                          {bookValues.nada?.value ? formatCurrency(bookValues.nada.value) : 'Not Found'}
                        </div>
                      </div>

                      {/* JD Power */}
                      <div style={{
                        padding: '12px',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>JD Power</span>
                          {bookValues.jd_power?.source_url && (
                            <a href={bookValues.jd_power.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontSize: '10px', textDecoration: 'none' }}>
                              View Source
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: bookValues.jd_power?.value ? theme.text : theme.textMuted }}>
                          {bookValues.jd_power?.value ? formatCurrency(bookValues.jd_power.value) : 'Not Found'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Market Tab */}
              {activeTab === 'market' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>
                    Market Analysis
                    <SourceIndicator source={results.data_sources?.market_data} />
                  </h3>

                  {results.market_stats ? (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>DAYS TO SELL</div>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: results.market_stats.demand_level === 'Hot' ? '#ef4444' : results.market_stats.demand_level === 'Cold' ? '#3b82f6' : '#eab308' }}>
                            {results.market_stats.avg_dom ?? 'N/A'}
                          </div>
                          <div style={{ fontSize: '12px', color: theme.textMuted }}>avg days</div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>DEMAND</div>
                          <div style={{ fontSize: '24px', marginBottom: '4px' }}>
                            {results.market_stats.demand_level === 'Hot' ? '🔥' : results.market_stats.demand_level === 'Cold' ? '❄️' : '⚡'}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: results.market_stats.demand_level === 'Hot' ? '#ef4444' : results.market_stats.demand_level === 'Cold' ? '#3b82f6' : '#eab308' }}>
                            {results.market_stats.demand_level}
                          </div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>PRICE TREND</div>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: results.market_stats.price_trend === 'Rising' ? '#22c55e' : results.market_stats.price_trend === 'Falling' ? '#ef4444' : '#eab308' }}>
                            {results.market_stats.price_trend === 'Rising' ? '↑' : results.market_stats.price_trend === 'Falling' ? '↓' : '→'}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{results.market_stats.price_trend}</div>
                        </div>
                        <div style={{ padding: '20px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>SUPPLY</div>
                          <div style={{ fontSize: '32px', fontWeight: '700', color: theme.text }}>{results.market_stats.listing_count ?? 0}</div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: results.market_stats.supply_level === 'High' ? '#22c55e' : results.market_stats.supply_level === 'Low' ? '#ef4444' : '#eab308' }}>
                            {results.market_stats.supply_level}
                          </div>
                        </div>
                      </div>

                      {results.market_stats.price_range && (
                        <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                          <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '600', marginBottom: '12px' }}>PRICE RANGE</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>MIN</div>
                              <div style={{ fontSize: '20px', fontWeight: '600', color: '#22c55e' }}>{formatCurrency(results.market_stats.price_range.min)}</div>
                            </div>
                            <div style={{ flex: 1, height: '4px', backgroundColor: theme.border, margin: '0 16px', borderRadius: '2px' }}>
                              <div style={{ width: '50%', height: '100%', backgroundColor: theme.accent, borderRadius: '2px' }} />
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>MAX</div>
                              <div style={{ fontSize: '20px', fontWeight: '600', color: '#ef4444' }}>{formatCurrency(results.market_stats.price_range.max)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ color: theme.textMuted, textAlign: 'center', padding: '40px' }}>No market data available</div>
                  )}
                </div>
              )}

              {/* Comparables Tab */}
              {activeTab === 'comparables' && (
                <div>
                  {/* Dealer Listings Section */}
                  <div style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Dealer Listings</h3>
                      <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>
                        {results.dealer_comparables?.length || 0} found
                      </span>
                      <TrimTierBadge tier={results.trim_tier} />
                      <SourceIndicator source="marketcheck" label="MarketCheck" />
                    </div>

                    {results.dealer_comparables?.length > 0 ? (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {results.dealer_comparables.map((c, i) => (
                          <div key={i} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{c.title}</span>
                                <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>DEALER</span>
                                <TrimTierBadge tier={c.trim_tier} />
                              </div>
                              <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                                {formatNumber(c.miles)} mi • {c.location}
                                {c.fuel_type && (
                                  <span style={{ color: isDiesel(c.fuel_type) ? '#eab308' : '#3b82f6', fontWeight: isDiesel(c.fuel_type) ? '600' : '400' }}> • {c.fuel_type}</span>
                                )}
                              </div>
                              {/* Body type and drivetrain row */}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                {c.body_type && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(107,114,128,0.15)', color: theme.textSecondary }}>
                                    {c.body_type}
                                  </span>
                                )}
                                {c.drivetrain && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                                    {c.drivetrain}
                                  </span>
                                )}
                              </div>
                              {c.dealer && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{c.dealer}</div>}
                              {c.dom > 0 && <div style={{ color: theme.textMuted, fontSize: '11px' }}>{c.dom} days on market</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ color: theme.accent, fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.url && (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: theme.accent, color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                  View
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        No dealer listings found matching trim tier
                      </div>
                    )}
                  </div>

                  {/* Private Party Section */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Private Party Listings</h3>
                      <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        {results.private_comparables?.length || 0} found
                      </span>
                      <SourceIndicator source={results.data_sources?.private_comparables} label="SerpAPI" />
                    </div>

                    {results.private_comparables?.length > 0 ? (
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {results.private_comparables.map((c, i) => (
                          <div key={i} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{c.title}</span>
                                <SourceBadge source={c.source} />
                                <TrimTierBadge tier={c.trim_tier} />
                              </div>
                              <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                                {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                                {c.miles && c.location && <span> • </span>}
                                {c.location && <span>{c.location}</span>}
                              </div>
                              {/* Body type and drivetrain row for private party */}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                {c.body_type && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(107,114,128,0.15)', color: theme.textSecondary }}>
                                    {c.body_type}
                                  </span>
                                )}
                                {c.drivetrain && (
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                                    {c.drivetrain}
                                  </span>
                                )}
                              </div>
                              {c.snippet && <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>{c.snippet}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.url && (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                                  View
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        {results.debug?.serp_api_configured ? 'No private party listings found' : 'SerpAPI not configured - private party search disabled'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Specs Tab */}
              {activeTab === 'specs' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>
                    Vehicle Specs
                    <SourceIndicator source={results.data_sources?.vin_decode} />
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    {Object.entries(results.vehicle || {}).filter(([k, v]) => v && k !== 'vin' && k !== 'miles' && k !== 'trim_tier').map(([k, v]) => (
                      <div key={k} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>

                  {results.vehicle?.vin && (
                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px' }}>VIN</div>
                      <div style={{ color: theme.text, fontSize: '14px', fontFamily: 'monospace', letterSpacing: '1px' }}>{results.vehicle.vin}</div>
                    </div>
                  )}

                  {/* Debug Info */}
                  {results.debug && (
                    <div style={{ marginTop: '24px', padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase' }}>Debug Info</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>
                        <div>MarketCheck listings: {results.debug.total_mc_listings ?? 0}</div>
                        <div>Filtered dealer comps: {results.debug.filtered_dealer_count ?? 0}</div>
                        <div>Private party comps: {results.debug.private_count ?? 0}</div>
                        <div>SerpAPI configured: {results.debug.serp_api_configured ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* FIND COMPARABLES SECTION - NEW */}
        <div style={{ ...cardStyle, marginTop: '24px', border: '2px solid #22c55e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            <h3 style={{ margin: 0, color: '#22c55e', fontSize: '16px', fontWeight: '600' }}>Find Comparables</h3>
            <span style={{ fontSize: '11px', color: theme.textMuted }}>(250 mile radius)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Year Min</label>
              <input type="number" value={compYearMin} onChange={(e) => setCompYearMin(e.target.value)} placeholder="2018" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Year Max</label>
              <input type="number" value={compYearMax} onChange={(e) => setCompYearMax(e.target.value)} placeholder="2024" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Make</label>
              <select value={compMake} onChange={(e) => setCompMake(e.target.value)} style={selectStyle}>
                <option value="">Any Make</option>
                {MAKES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Model</label>
              <select value={compModel} onChange={(e) => setCompModel(e.target.value)} style={selectStyle} disabled={!compMake}>
                <option value="">Any Model</option>
                {compModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Max Price</label>
              <input type="number" value={compMaxPrice} onChange={(e) => setCompMaxPrice(e.target.value)} placeholder="30000" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Max Miles</label>
              <input type="number" value={compMaxMiles} onChange={(e) => setCompMaxMiles(e.target.value)} placeholder="100000" style={inputStyle} />
            </div>
          </div>

          <button
            onClick={handleComparablesSearch}
            disabled={compLoading}
            style={{ ...btnStyle(true), backgroundColor: '#22c55e', padding: '12px 32px', opacity: compLoading ? 0.6 : 1 }}
          >
            {compLoading ? 'Searching...' : 'Search Comparables'}
          </button>

          {compError && (
            <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>
              {compError}
            </div>
          )}

          {compResults && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                {compResults.comparables?.length || 0} vehicles found
              </div>

              {compResults.comparables?.length > 0 ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {compResults.comparables.map((c, i) => (
                    <div key={i} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '14px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>
                          {c.year} {c.make} {c.model} {c.trim || ''}
                        </div>
                        <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                          {c.miles && <span>{formatNumber(c.miles)} mi</span>}
                          {c.miles && c.location && <span> • </span>}
                          {c.location && <span>{c.location}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ color: '#22c55e', fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 12px', backgroundColor: '#22c55e', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '12px', fontWeight: '600' }}>
                            View
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: theme.textMuted, padding: '24px', textAlign: 'center', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                  No vehicles found matching your criteria
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
