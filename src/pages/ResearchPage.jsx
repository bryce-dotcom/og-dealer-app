import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';

export default function ResearchPage() {
  const { dealer } = useStore();
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Load from URL params (backward compatibility)
  useEffect(() => {
    const query = searchParams.get('query');
    const vin = searchParams.get('vin');
    const year = searchParams.get('year');
    const make = searchParams.get('make');
    const model = searchParams.get('model');
    const autorun = searchParams.get('autorun');

    if (query) {
      setSearchQuery(query);
      if (autorun === 'true') handleSearch(query);
    } else if (vin) {
      setSearchQuery(vin);
      if (autorun === 'true') handleSearch(vin);
    } else if (year && make) {
      const q = `${year} ${make} ${model || ''}`.trim();
      setSearchQuery(q);
      if (autorun === 'true') handleSearch(q);
    }
  }, [searchParams]);

  const detectSearchType = (query) => {
    const trimmed = query.trim();

    // VIN detection (17 characters, alphanumeric)
    if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(trimmed)) {
      return { type: 'vin', vin: trimmed };
    }

    // Parse natural language (e.g., "2020 Ford F-150", "F-150 under 30k")
    const yearMatch = trimmed.match(/\b(19\d{2}|20\d{2})\b/);
    const priceMatch = trimmed.match(/under\s*\$?(\d{1,3}),?(\d{3})/i);
    const milesMatch = trimmed.match(/under\s*(\d{1,3}),?(\d{3})\s*miles/i);

    // Extract make (look for common makes)
    const makes = ['ford', 'chevrolet', 'chevy', 'toyota', 'honda', 'ram', 'gmc', 'jeep', 'dodge', 'nissan'];
    const makeLower = trimmed.toLowerCase();
    let make = null;
    for (const m of makes) {
      if (makeLower.includes(m)) {
        make = m === 'chevy' ? 'chevrolet' : m;
        break;
      }
    }

    if (!make) {
      return { type: 'invalid', error: 'Could not detect vehicle make. Try: "2020 Ford F-150" or VIN' };
    }

    // Extract model (everything after make, before price/miles)
    const makeIndex = makeLower.indexOf(make);
    let modelPart = trimmed.substring(makeIndex + make.length).trim();
    modelPart = modelPart.split(/under|max|price|miles/i)[0].trim();

    return {
      type: 'ymm',
      year: yearMatch ? parseInt(yearMatch[1]) : null,
      make: make.charAt(0).toUpperCase() + make.slice(1),
      model: modelPart || null,
      max_price: priceMatch ? parseInt(priceMatch[1] + priceMatch[2]) : null,
      max_miles: milesMatch ? parseInt(milesMatch[1] + milesMatch[2]) : null,
    };
  };

  const handleSearch = async (queryOverride = null) => {
    const query = queryOverride || searchQuery;
    if (!query.trim()) {
      setError('Enter a search query');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const parsed = detectSearchType(query);

      if (parsed.type === 'invalid') {
        setError(parsed.error);
        setLoading(false);
        return;
      }

      if (parsed.type === 'vin') {
        // VIN search - use vehicle-research
        const { data, error: fnError } = await supabase.functions.invoke('vehicle-research', {
          body: {
            vin: parsed.vin,
            miles: 60000,
            condition: 'Good',
            zip: dealer?.zip || '84065',
          }
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        setResults({
          type: 'vin',
          vehicle: data.vehicle,
          values: data.values,
          market_stats: data.market_stats,
          comparables: data.comparables,
        });
      } else {
        // YMM/General search - use find-vehicles
        const { data, error: fnError } = await supabase.functions.invoke('find-vehicles', {
          body: {
            year_min: parsed.year,
            year_max: parsed.year,
            make: parsed.make,
            model: parsed.model,
            max_price: parsed.max_price,
            max_miles: parsed.max_miles,
            zip_code: dealer?.zip || '84065',
            radius_miles: 250,
          }
        });

        if (fnError) throw fnError;

        setResults({
          type: 'ymm',
          search_params: parsed,
          market_summary: data.market_summary,
          dealer_listings: data.dealer_listings || [],
          private_listings: data.private_listings || [],
          total_found: data.total_found || 0,
        });
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  };

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '16px',
    outline: 'none',
  };

  const buttonStyle = {
    padding: '14px 32px',
    backgroundColor: '#f97316',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#09090b', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#fff', margin: 0 }}>
            Vehicle Research
          </h1>
          <p style={{ color: '#71717a', margin: '8px 0 0', fontSize: '14px' }}>
            Quick lookup for specific vehicles
          </p>
        </div>

        {/* Search Box */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: '#a1a1aa', fontSize: '13px', marginBottom: '8px' }}>
                Search by VIN, Year/Make/Model, or natural language
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder='Try: "2020 Ford F-150", "1FTFW1E85LFA12345", or "Chevy Silverado under $30k"'
                style={inputStyle}
                autoFocus
              />
            </div>
            <button onClick={() => handleSearch()} disabled={loading} style={buttonStyle}>
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Examples */}
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#52525b' }}>
            <span style={{ marginRight: '16px' }}>💡 Examples:</span>
            <button onClick={() => setSearchQuery('2020 Ford F-150')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', textDecoration: 'underline', marginRight: '12px' }}>
              2020 Ford F-150
            </button>
            <button onClick={() => setSearchQuery('Chevy Silverado under 30k')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', textDecoration: 'underline', marginRight: '12px' }}>
              Chevy Silverado under $30k
            </button>
            <button onClick={() => setSearchQuery('1FTFW1E85LFA12345')} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', textDecoration: 'underline' }}>
              VIN: 1FTFW1E85LFA12345
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            ...cardStyle,
            backgroundColor: '#ef444420',
            border: '1px solid #ef4444',
            color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        {/* Results: VIN Search */}
        {results?.type === 'vin' && (
          <div>
            {/* Vehicle Info */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
                {results.vehicle.year} {results.vehicle.make} {results.vehicle.model} {results.vehicle.trim}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', fontSize: '14px' }}>
                <div>
                  <div style={{ color: '#71717a' }}>VIN</div>
                  <div style={{ color: '#fff', fontWeight: '600', fontFamily: 'monospace' }}>{results.vehicle.vin}</div>
                </div>
                {results.vehicle.body_type && (
                  <div>
                    <div style={{ color: '#71717a' }}>Body Type</div>
                    <div style={{ color: '#fff' }}>{results.vehicle.body_type}</div>
                  </div>
                )}
                {results.vehicle.engine && (
                  <div>
                    <div style={{ color: '#71717a' }}>Engine</div>
                    <div style={{ color: '#fff' }}>{results.vehicle.engine}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Values */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
                Market Values
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {results.values.retail && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Retail</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>
                      ${results.values.retail.toLocaleString()}
                    </div>
                  </div>
                )}
                {results.values.trade_in && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Trade-In</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#3b82f6' }}>
                      ${results.values.trade_in.toLocaleString()}
                    </div>
                  </div>
                )}
                {results.values.wholesale && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Wholesale</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#eab308' }}>
                      ${results.values.wholesale.toLocaleString()}
                    </div>
                  </div>
                )}
                {results.values.mmr && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>MMR</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#f97316' }}>
                      ${results.values.mmr.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Comparables */}
            {(results.comparables?.dealer_listings?.length > 0 || results.comparables?.private_listings?.length > 0) && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
                  Similar Vehicles for Sale
                </h3>
                <ComparablesDisplay comparables={results.comparables} />
              </div>
            )}
          </div>
        )}

        {/* Results: YMM Search */}
        {results?.type === 'ymm' && (
          <div>
            {/* Market Summary */}
            {results.market_summary && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
                  Market Summary
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Avg Price</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
                      ${results.market_summary.avg_price?.toLocaleString() || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Median Price</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
                      ${results.market_summary.median_price?.toLocaleString() || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Available</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
                      {results.market_summary.total_available || results.total_found}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '4px' }}>Days on Market</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
                      {results.market_summary.avg_days_on_market || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Listings */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '16px' }}>
                Found {results.total_found} vehicles
              </h3>

              {/* Dealer Listings */}
              {results.dealer_listings.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '14px', color: '#71717a', marginBottom: '12px' }}>
                    Dealer Listings ({results.dealer_listings.length})
                  </h4>
                  {results.dealer_listings.slice(0, 10).map((vehicle, i) => (
                    <VehicleCard key={i} vehicle={vehicle} type="dealer" />
                  ))}
                </div>
              )}

              {/* Private Party Listings */}
              {results.private_listings.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', color: '#71717a', marginBottom: '12px' }}>
                    Private Party ({results.private_listings.length})
                  </h4>
                  {results.private_listings.slice(0, 10).map((vehicle, i) => (
                    <VehicleCard key={i} vehicle={vehicle} type="private" />
                  ))}
                </div>
              )}

              {results.total_found === 0 && (
                <div style={{ textAlign: 'center', color: '#71717a', padding: '40px' }}>
                  No vehicles found. Try a different search.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Vehicle Card Component
function VehicleCard({ vehicle, type }) {
  const dealScoreColor =
    vehicle.deal_score === 'GREAT DEAL' || vehicle.estimated_deal_score === 'GREAT DEAL' ? '#22c55e' :
    vehicle.deal_score === 'GOOD DEAL' || vehicle.estimated_deal_score === 'GOOD DEAL' ? '#3b82f6' :
    vehicle.deal_score === 'FAIR PRICE' || vehicle.estimated_deal_score === 'FAIR PRICE' ? '#eab308' : '#71717a';

  return (
    <div style={{
      padding: '16px',
      backgroundColor: '#27272a',
      borderRadius: '8px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', marginBottom: '4px' }}>
            {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim || ''}
          </div>
          <div style={{ fontSize: '13px', color: '#71717a' }}>
            {type === 'dealer' && vehicle.dealer_name} • {vehicle.location}
          </div>
        </div>
        {(vehicle.deal_score || vehicle.estimated_deal_score) && (
          <div style={{
            padding: '4px 12px',
            backgroundColor: dealScoreColor + '20',
            color: dealScoreColor,
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '700',
          }}>
            {vehicle.deal_score || vehicle.estimated_deal_score}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', fontSize: '14px' }}>
        <div>
          <span style={{ color: '#71717a' }}>Price:</span>{' '}
          <span style={{ color: '#fff', fontWeight: '600' }}>${vehicle.price?.toLocaleString()}</span>
        </div>
        <div>
          <span style={{ color: '#71717a' }}>Miles:</span>{' '}
          <span style={{ color: '#fff' }}>{vehicle.miles?.toLocaleString() || 'Unknown'}</span>
        </div>
        {vehicle.savings && (
          <div>
            <span style={{ color: '#71717a' }}>Savings:</span>{' '}
            <span style={{ color: '#22c55e', fontWeight: '600' }}>
              ${vehicle.savings.toLocaleString()} ({vehicle.savings_percentage}%)
            </span>
          </div>
        )}
      </div>

      {vehicle.url && (
        <a href={vehicle.url} target="_blank" rel="noopener noreferrer">
          <button style={{
            padding: '8px 16px',
            backgroundColor: '#f97316',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
          }}>
            View Listing
          </button>
        </a>
      )}
    </div>
  );
}

// Comparables Display Component
function ComparablesDisplay({ comparables }) {
  const allListings = [
    ...(comparables.dealer_listings || []),
    ...(comparables.private_listings || []),
  ].slice(0, 6);

  return (
    <div>
      {allListings.map((vehicle, i) => (
        <VehicleCard
          key={i}
          vehicle={vehicle}
          type={vehicle.seller_type === 'Dealer' ? 'dealer' : 'private'}
        />
      ))}
    </div>
  );
}
