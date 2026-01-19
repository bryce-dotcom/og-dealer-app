import { useState, useRef, useEffect } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useTheme } from '../components/Layout';

export default function ResearchPage() {
  const { dealer } = useStore();
  const themeContext = useTheme();
  const theme = themeContext?.theme || {
    bg: '#09090b', bgCard: '#18181b', bgCardHover: '#27272a', border: '#27272a',
    text: '#ffffff', textSecondary: '#a1a1aa', textMuted: '#71717a',
    accent: '#f97316', accentBg: 'rgba(249,115,22,0.15)'
  };
  const isDark = themeContext?.darkMode !== false;

  const [searchMode, setSearchMode] = useState('vin');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [miles, setMiles] = useState('60000');
  const [condition, setCondition] = useState('Good');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('values');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlVin = params.get('vin');
    const urlYear = params.get('year');
    const urlMake = params.get('make');
    const urlModel = params.get('model');
    const urlMiles = params.get('miles');
    const autorun = params.get('autorun');
    
    if (urlVin && urlVin.length === 17) {
      setVin(urlVin);
      setSearchMode('vin');
      if (urlMiles) setMiles(urlMiles);
      if (autorun === 'true') {
        setTimeout(() => handleSearchWithParams(urlVin, null, null, null, null, parseInt(urlMiles) || 60000), 300);
      }
    } else if (urlYear && urlMake && urlModel) {
      setYear(urlYear);
      setMake(urlMake);
      setModel(urlModel);
      if (urlMiles) setMiles(urlMiles);
      setSearchMode('ymm');
      if (autorun === 'true') {
        setTimeout(() => handleSearchWithParams(null, urlYear, urlMake, urlModel, null, parseInt(urlMiles) || 60000), 300);
      }
    }
  }, []);

  const handleSearchWithParams = async (vinParam, yearParam, makeParam, modelParam, trimParam, milesParam) => {
    setLoading(true);
    setError(null);
    setResults(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('vehicle-research', {
        body: {
          vin: vinParam || null,
          year: yearParam ? parseInt(yearParam) : null,
          make: makeParam || null,
          model: modelParam || null,
          trim: trimParam || null,
          miles: milesParam || 60000,
          condition: 'Good',
          zip: dealer?.zip || '84065'
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
          zip: dealer?.zip || '84065'
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

  const formatCurrency = (num) => {
    if (!num && num !== 0) return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '0';
    return new Intl.NumberFormat('en-US').format(num);
  };

  const wholesaleLow = results?.valuations?.wholesale_low || 0;
  
  const isHotDeal = (price) => {
    if (!wholesaleLow || !price) return false;
    return price <= wholesaleLow * 1.15;
  };

  const inputStyle = { 
    padding: '12px 14px', borderRadius: '8px', border: `1px solid ${theme.border}`, 
    backgroundColor: isDark ? theme.bgCard : '#ffffff', color: theme.text, fontSize: '15px', outline: 'none', width: '100%'
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
        
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', margin: 0, color: theme.text }}>Vehicle Research</h1>
          <p style={{ color: theme.textMuted, margin: '8px 0 0', fontSize: '14px' }}>Get instant valuations and market analysis</p>
        </div>

        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => setSearchMode('vin')} style={btnStyle(searchMode === 'vin')}>Search by VIN</button>
            <button onClick={() => setSearchMode('ymm')} style={btnStyle(searchMode === 'ymm')}>Search by Year/Make/Model</button>
          </div>

          {searchMode === 'vin' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>VIN</label>
                <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17-character VIN" style={inputStyle} maxLength={17} />
              </div>
              <button onClick={handleSearch} disabled={loading} style={{ ...btnStyle(true), padding: '12px 32px', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Researching...' : 'Research'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Year *</label>
                <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2020" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Make *</label>
                <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Model *</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Camry" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Trim</label>
                <input value={trim} onChange={(e) => setTrim(e.target.value)} placeholder="SE" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Miles</label>
                <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="60000" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: theme.textMuted, display: 'block', marginBottom: '6px' }}>Condition</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} style={inputStyle}>
                  <option value="Excellent">Excellent</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button onClick={handleSearch} disabled={loading} style={{ ...btnStyle(true), width: '100%', opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Researching...' : 'Research'}
                </button>
              </div>
            </div>
          )}

          {error && <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px' }}>{error}</div>}
        </div>

        {results && (
          <>
            <div style={{ ...cardStyle, marginBottom: '20px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: theme.text }}>
                  {results.vehicle?.year} {results.vehicle?.make} {results.vehicle?.model} {results.vehicle?.trim}
                </h2>
                <span style={{ fontSize: '14px', color: theme.textMuted }}>{formatNumber(results.vehicle?.miles)} miles</span>
                <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', backgroundColor: results.confidence === 'HIGH' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)', color: results.confidence === 'HIGH' ? '#22c55e' : '#eab308' }}>
                  {results.confidence} Confidence
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={btnStyle(activeTab === tab.id)}>{tab.label}</button>
              ))}
            </div>

            <div style={cardStyle}>
              {activeTab === 'values' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>Book Values & Wholesale</h3>
                  
                  <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: isDark ? 'rgba(249,115,22,0.1)' : 'rgba(249,115,22,0.08)', borderRadius: '12px', border: `2px solid ${theme.accent}` }}>
                    <div style={{ fontSize: '12px', color: theme.accent, fontWeight: '600', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>WHOLESALE (Your Buy Range)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>LOW</div>
                        <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(results.valuations?.wholesale_low)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>AVERAGE</div>
                        <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>{formatCurrency(results.valuations?.wholesale_avg)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>HIGH</div>
                        <div style={{ fontSize: '28px', fontWeight: '700', color: '#eab308' }}>{formatCurrency(results.valuations?.wholesale_high)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                    {results.valuations?.kbb_retail && (
                      <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>KBB RETAIL</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatCurrency(results.valuations.kbb_retail)}</div>
                      </div>
                    )}
                    {results.valuations?.nada_retail && (
                      <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>NADA RETAIL</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatCurrency(results.valuations.nada_retail)}</div>
                      </div>
                    )}
                    {results.valuations?.mmr && (
                      <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>MANHEIM MMR</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatCurrency(results.valuations.mmr)}</div>
                      </div>
                    )}
                    {results.valuations?.marketcheck && (
                      <div style={{ padding: '16px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>MARKETCHECK</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatCurrency(results.valuations.marketcheck)}</div>
                      </div>
                    )}
                  </div>

                  {results.pricing_recommendation && (
                    <div style={{ marginTop: '24px', padding: '16px', backgroundColor: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.3)' }}>
                      <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: '600', marginBottom: '8px' }}>PRICING RECOMMENDATIONS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                        {results.pricing_recommendation.quick_sale_price && <div><span style={{ color: theme.textMuted, fontSize: '12px' }}>Quick Sale:</span> <span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(results.pricing_recommendation.quick_sale_price)}</span></div>}
                        {results.pricing_recommendation.optimal_price && <div><span style={{ color: theme.textMuted, fontSize: '12px' }}>Optimal:</span> <span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(results.pricing_recommendation.optimal_price)}</span></div>}
                        {results.pricing_recommendation.dealer_buy_max && <div><span style={{ color: theme.textMuted, fontSize: '12px' }}>Max Offer:</span> <span style={{ color: theme.text, fontWeight: '600' }}>{formatCurrency(results.pricing_recommendation.dealer_buy_max)}</span></div>}
                      </div>
                      {results.pricing_recommendation.reasoning && <div style={{ marginTop: '12px', fontSize: '13px', color: theme.textMuted, fontStyle: 'italic' }}>{results.pricing_recommendation.reasoning}</div>}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'market' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>Market Analysis</h3>
                  {results.market_analysis ? (
                    <div style={{ display: 'grid', gap: '16px' }}>
                      {Object.entries(results.market_analysis).map(([key, value]) => (
                        <div key={key} style={{ padding: '14px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '10px' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: '15px', color: theme.text }}>{typeof value === 'object' ? JSON.stringify(value) : value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: theme.textMuted }}>No market analysis available</div>
                  )}
                </div>
              )}

              {activeTab === 'comparables' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Comparable Listings</h3>
                    {wholesaleLow > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: theme.textMuted }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#22c55e', borderRadius: '3px' }}></span>
                        Within 15% of wholesale low ({formatCurrency(wholesaleLow)})
                      </div>
                    )}
                  </div>
                  {results.comparables && results.comparables.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {results.comparables.map((c, i) => {
                        const hotDeal = isHotDeal(c.price);
                        return (
                          <div key={i} style={{ 
                            backgroundColor: isDark ? theme.bg : '#f8fafc', 
                            padding: '14px', 
                            borderRadius: '10px', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            flexWrap: 'wrap', 
                            gap: '12px',
                            border: hotDeal ? '2px solid #22c55e' : 'none',
                            position: 'relative'
                          }}>
                            {hotDeal && (
                              <div style={{ position: 'absolute', top: '-8px', right: '12px', backgroundColor: '#22c55e', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                HOT DEAL
                              </div>
                            )}
                            <div style={{ flex: '1', minWidth: '200px' }}>
                              <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{c.title}</div>
                              <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '4px' }}>
                                {formatNumber(c.miles)} mi • {c.location} • {c.source}
                              </div>
                              {c.days_listed && <div style={{ color: theme.textMuted, fontSize: '11px' }}>{c.days_listed} days listed</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{ color: hotDeal ? '#22c55e' : theme.accent, fontWeight: '700', fontSize: '20px' }}>{formatCurrency(c.price)}</div>
                              {c.url ? (
                                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                  View Ad
                                </a>
                              ) : (
                                <span style={{ fontSize: '11px', color: theme.textMuted, fontStyle: 'italic' }}>No link</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ color: theme.textMuted, padding: '40px', textAlign: 'center' }}>No comparables found</div>
                  )}
                </div>
              )}

              {activeTab === 'specs' && (
                <div>
                  <h3 style={{ color: theme.text, margin: '0 0 20px', fontSize: '18px' }}>Vehicle Specs</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    {Object.entries(results.vehicle || {}).filter(([k, v]) => v && k !== 'vin' && k !== 'miles').map(([k, v]) => (
                      <div key={k} style={{ backgroundColor: isDark ? theme.bg : '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                        <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                        <div style={{ color: theme.text, fontSize: '14px', fontWeight: '500' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '16px', padding: '12px', backgroundColor: isDark ? theme.bg : '#f8fafc', borderRadius: '8px' }}>
                    <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '4px' }}>DATA SOURCE</div>
                    <div style={{ color: theme.text, fontSize: '13px' }}>{results.data_source}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}